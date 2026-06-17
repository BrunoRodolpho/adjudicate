/**
 * Redis-backed `TokenUsageStore` (ADR-135 telemetry surface, durable variant).
 *
 * The in-memory `createInMemoryTokenUsageStore` (see `./token-usage-store.ts`)
 * loses every counter on a process restart, and — more importantly for the
 * operator console — it only ever sees the samples THIS process recorded. In a
 * real deployment the adapter loop that consumes provider usage runs in a
 * SEPARATE process (the ibatexas runtime), which writes per-session token
 * totals to Redis under `llm:tokens:*`. The console runs no adapter loop, so it
 * must READ those keys to populate the Token Governance section with real data.
 *
 * # Why a write-through cache, not a fully-async store
 *
 * `TokenUsageStore`'s read methods (`sessions`/`tenants`/`exhaustionEvents`/
 * `totalConsumed`) are SYNCHRONOUS (they back the admin-sdk port directly). To
 * satisfy that interface AND read from Redis, this is a WRITE-THROUGH /
 * read-through CACHE: an in-memory `createInMemoryTokenUsageStore` backs the
 * synchronous reads, and an async `refresh()` re-folds the live `llm:tokens:*`
 * keyspace into a FRESH in-memory store via SCAN. The caller (the console port)
 * `await store.refresh()` before reading; `refresh()` is rate-limited to at
 * most once per `cacheTtlMs` (default ~1 min) so a burst of admin requests does
 * not SCAN Redis on every request. Mirrors the durable-via-cache shape of
 * `createPostgresRemediationProposalStore` (adjutant).
 *
 * # SCAN, never KEYS
 *
 * Enumeration uses the injected client's `scan(pattern)` — production wires it
 * to node-redis `scanIterator` (NOT the O(N)-blocking `KEYS`), exactly as
 * `createLazyRedisApprovalAdapter().keys()` does. A large keyspace never stalls
 * Redis.
 *
 * # Determinism boundary — unchanged
 *
 * This is TELEMETRY, strictly OUTSIDE the kernel determinism boundary (see the
 * module docs on `./token-usage-store.ts`). It NEVER feeds a kernel decision.
 * `Date.now()` is permitted here (the cache TTL clock) — it is not a recorded
 * value and not a kernel input. Recorded sample timestamps are still
 * source-supplied (from the Redis value, or `nowIso()` when the producer wrote
 * none).
 *
 * # Wire format (shared with the producer)
 *
 * Each key `${keyPrefix}:<sessionId>` holds one of:
 *   - a JSON object `{ sessionId?, tenantId?, total, prompt?, completion?, at? }`
 *     (`total` REQUIRED; `sessionId` defaults to the key suffix), or
 *   - a bare integer string (the combined token total; tenant unknown).
 * The ibatexas runtime writes a combined total (no provider split), so the
 * common case carries `total` only — the console omits the USD cost column for
 * those rows (no split to price). A malformed value is skipped, never thrown.
 *
 * Fail-open: a Redis blip during `refresh()` is swallowed — the last good
 * snapshot keeps serving. The operator UI must never 500 on a telemetry read.
 */

import {
  createInMemoryTokenUsageStore,
  type CreateInMemoryTokenUsageStoreOptions,
  type ExhaustionEventsFilter,
  type SessionsFilter,
  type TenantsFilter,
  type TokenExhaustionEvent,
  type TokenUsageSample,
  type TokenUsageStore,
  type SessionConsumption,
  type TenantConsumption,
} from "./token-usage-store.js";

/**
 * Minimal Redis surface the adopter injects — intentionally narrow so the
 * package does NOT hard-depend on a concrete client. `scan` enumerates keys by
 * glob pattern (SCAN-backed, never the blocking `KEYS`); `get` reads one value.
 */
export interface TokenUsageRedisClient {
  /** Prefix-scoped key enumeration (glob). SCAN-backed in production clients. */
  scan(pattern: string): Promise<readonly string[]>;
  get(key: string): Promise<string | null>;
  /**
   * Optional batched read (#28-8). When present, `refresh()` reads the scanned
   * keyspace with chunked MGETs (ceil(N/500) round-trips) instead of N GETs.
   * Omit it and the store transparently falls back to the per-key `get` path.
   */
  mget?(keys: readonly string[]): Promise<readonly (string | null)[]>;
}

/** Max keys per MGET batch (#28-8) — keeps each command's argv bounded. */
const MGET_CHUNK_SIZE = 500;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Read every key via chunked MGET, zipping each batch's keys with its values.
 * A failed batch maps every key in it to `null` (fail-open per-batch) rather
 * than aborting the whole refresh — mirrors the per-key GET fallback's posture.
 */
async function readViaMget(
  mget: (keys: readonly string[]) => Promise<readonly (string | null)[]>,
  keys: readonly string[],
): Promise<Array<readonly [string, string | null]>> {
  const out: Array<readonly [string, string | null]> = [];
  for (const batch of chunk(keys, MGET_CHUNK_SIZE)) {
    let vals: readonly (string | null)[];
    try {
      vals = await mget(batch);
    } catch {
      vals = batch.map(() => null);
    }
    batch.forEach((k, i) => out.push([k, vals[i] ?? null] as const));
  }
  return out;
}

export interface CreateRedisTokenUsageStoreOptions
  extends CreateInMemoryTokenUsageStoreOptions {
  readonly redis: TokenUsageRedisClient;
  /** Key namespace the producer writes under. Default `"llm:tokens"`. */
  readonly keyPrefix?: string;
  /** Min interval between SCAN refreshes (ms). Default 60_000 (~1 min). */
  readonly cacheTtlMs?: number;
  /** Fallback ISO timestamp when a value carries no `at`. Default: wall-clock. */
  readonly nowIso?: () => string;
  /** Best-effort refresh-error hook (default: swallow). */
  readonly onRefreshError?: (err: unknown) => void;
}

/**
 * A `TokenUsageStore` whose synchronous reads are served from an in-memory
 * snapshot re-folded from the live `${keyPrefix}:*` Redis keyspace. Adds
 * `refresh()` over the base interface; call it before a read (it self-throttles
 * to `cacheTtlMs`).
 */
export interface RedisTokenUsageStore extends TokenUsageStore {
  /**
   * Re-SCAN the keyspace and rebuild the in-memory snapshot. Rate-limited to at
   * most once per `cacheTtlMs`; concurrent calls share one in-flight refresh.
   * Fail-open: a Redis error keeps the previous snapshot and is reported to
   * `onRefreshError`.
   */
  refresh(): Promise<void>;
}

/** Parse one Redis value into a usage sample, or `null` if unusable. */
function parseSample(
  sessionId: string,
  raw: string,
  fallbackAt: string,
): TokenUsageSample | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // Bare-integer form: a combined token total, tenant unknown.
  if (/^\d+$/.test(trimmed)) {
    return { sessionId, total: Number.parseInt(trimmed, 10), at: fallbackAt };
  }

  // JSON object form.
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const total = typeof obj.total === "number" ? obj.total : undefined;
  const prompt = typeof obj.prompt === "number" ? obj.prompt : undefined;
  const completion =
    typeof obj.completion === "number" ? obj.completion : undefined;
  // Need at least one numeric quantity to record anything.
  if (total === undefined && prompt === undefined && completion === undefined) {
    return null;
  }
  const sid =
    typeof obj.sessionId === "string" && obj.sessionId.length > 0
      ? obj.sessionId
      : sessionId;
  const tenantId =
    typeof obj.tenantId === "string" && obj.tenantId.length > 0
      ? obj.tenantId
      : undefined;
  const at =
    typeof obj.at === "string" && obj.at.length > 0 ? obj.at : fallbackAt;

  return {
    sessionId: sid,
    ...(tenantId !== undefined ? { tenantId } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(completion !== undefined ? { completion } : {}),
    at,
  };
}

/**
 * Build a durable, read-through `TokenUsageStore` over Redis `llm:tokens:*`.
 * Synchronous reads come from an in-memory snapshot; `refresh()` re-folds the
 * live keyspace (SCAN) into a fresh snapshot, self-throttled to `cacheTtlMs`.
 */
export function createRedisTokenUsageStore(
  opts: CreateRedisTokenUsageStoreOptions,
): RedisTokenUsageStore {
  const keyPrefix = opts.keyPrefix ?? "llm:tokens";
  const pattern = `${keyPrefix}:*`;
  const cacheTtlMs = Math.max(0, opts.cacheTtlMs ?? 60_000);
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());
  const onRefreshError = opts.onRefreshError ?? (() => {});
  // Carry the budget/bound options through to each rebuilt snapshot.
  const baseOpts: CreateInMemoryTokenUsageStoreOptions = {
    ...(opts.sessionBudget !== undefined ? { sessionBudget: opts.sessionBudget } : {}),
    ...(opts.perSessionBudget !== undefined ? { perSessionBudget: opts.perSessionBudget } : {}),
    ...(opts.perTenantBudget !== undefined ? { perTenantBudget: opts.perTenantBudget } : {}),
    ...(opts.perTenantBudgets !== undefined ? { perTenantBudgets: opts.perTenantBudgets } : {}),
    ...(opts.maxSessions !== undefined ? { maxSessions: opts.maxSessions } : {}),
    ...(opts.maxEvents !== undefined ? { maxEvents: opts.maxEvents } : {}),
    ...(opts.capacity !== undefined ? { capacity: opts.capacity } : {}),
  };

  // The snapshot backing the synchronous reads. Rebuilt wholesale on refresh so
  // a deleted/expired Redis key drops out of the view (no stale accumulation).
  let snapshot: TokenUsageStore = createInMemoryTokenUsageStore(baseOpts);
  let lastRefreshAtMs = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;

  async function doRefresh(): Promise<void> {
    try {
      const keys = await opts.redis.scan(pattern);
      const next = createInMemoryTokenUsageStore(baseOpts);
      const at = nowIso();
      // Read each key; fold its sample into the fresh snapshot. Prefer chunked
      // MGET (#28-8) when the client exposes it — ceil(N/500) round-trips instead
      // of N — and fall back to per-key GET otherwise. A read failure maps the
      // affected key(s) to null rather than aborting the whole refresh.
      const mget = opts.redis.mget?.bind(opts.redis);
      const raws: Array<readonly [string, string | null]> = mget
        ? await readViaMget(mget, keys)
        : await Promise.all(
            keys.map(async (k) => {
              try {
                return [k, await opts.redis.get(k)] as const;
              } catch {
                return [k, null] as const;
              }
            }),
          );
      // Stable order so the snapshot is deterministic given the same keyspace.
      for (const [k, raw] of [...raws].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (raw === null) continue;
        // Derive the sessionId from the suffix after the prefix.
        const sessionId = k.startsWith(`${keyPrefix}:`)
          ? k.slice(keyPrefix.length + 1)
          : k;
        const sample = parseSample(sessionId, raw, at);
        if (sample !== null) next.record(sample);
      }
      snapshot = next;
      lastRefreshAtMs = Date.now();
    } catch (err) {
      // Fail-open: keep the previous snapshot, report, and back off one window
      // (set the clock so a retry storm doesn't hammer a degraded Redis).
      lastRefreshAtMs = Date.now();
      onRefreshError(err);
    }
  }

  return {
    async refresh(): Promise<void> {
      if (Date.now() - lastRefreshAtMs < cacheTtlMs) return;
      if (inflight) return inflight;
      inflight = doRefresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    // `record` folds into the live snapshot (e.g. an in-process onTokenUsage
    // hook layered on top of the Redis read); the next refresh rebuilds anyway.
    record(sample: TokenUsageSample): void {
      snapshot.record(sample);
    },
    sessions(filter?: SessionsFilter): SessionConsumption[] {
      return snapshot.sessions(filter);
    },
    tenants(filter?: TenantsFilter): TenantConsumption[] {
      return snapshot.tenants(filter);
    },
    exhaustionEvents(filter?: ExhaustionEventsFilter): TokenExhaustionEvent[] {
      return snapshot.exhaustionEvents(filter);
    },
    totalConsumed(): number {
      return snapshot.totalConsumed();
    },
  };
}
