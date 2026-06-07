/**
 * Redis-backed `ApprovalRegistry` — restart-durable display projections.
 *
 * The in-memory `createInMemoryApprovalRegistry` (see `./registry.ts`) is
 * suitable for tests and the quickstart, but a process restart loses every
 * resolved/pending projection — and the decision-history view (admin-sdk
 * `approval.history`) dies on cold start. Production adopters who want the
 * approval queue + history to survive deploys wire this Redis-backed
 * implementation instead.
 *
 * # What this is — and is NOT
 *
 * This is a **lossy display projection**, mirroring the in-memory registry. It
 * NEVER stores the authoritative envelope blob — that stays in adapter-core's
 * single-use `ConfirmationStore` (`put`/`take`). The registry only persists the
 * `ApprovalRequest` *display* fields (token, sessionId, intentHash, intentKind,
 * prompt, taint, channel, status, timestamps, resolvedBy). Resolving a token in
 * the registry does NOT authorize anything; authorization lives entirely in
 * `agent.confirm()` (single-use take + timing-safe hash verify + kernel
 * re-adjudication). See ADR-122 / ADR-136.
 *
 * # Wire format
 *
 * Each projection is JSON-encoded under `${keyPrefix}:req:${token}`. The TTL on
 * the key is the adopter-supplied `ttlSeconds` from `put()` (default 24h to
 * match the ConfirmationStore). `list()` enumerates via a prefix-scoped
 * `keys(pattern)` (SCAN-backed in production clients), bounded by the prefix.
 *
 * # markResolved atomicity (read-modify-write, guarded)
 *
 * `markResolved` is a guarded read-modify-write: GET the current projection,
 * verify it has not already moved out of `pending`, then SET the resolved
 * shape. The status guard makes a repeated resolve **idempotent** — a second
 * `markResolved` on an already-resolved token returns the existing resolved
 * projection WITHOUT a second SET (so `resolvedBy`/`resolvedAt` are stable).
 *
 * RESIDUAL TOCTOU (documented, accepted): Redis GET+SET here is not a single
 * atomic operation. Two concurrent `markResolved` calls on the SAME still-
 * `pending` token can both pass the GET guard before either SETs — a last-write-
 * wins race on `resolvedBy`/`resolvedAt`. This is a DISPLAY-projection race
 * only: the registry does not gate authorization, so the worst case is a
 * cosmetic mismatch on who/when, never a double-authorization. The real single-
 * use guarantee is enforced upstream by `ConfirmationStore.take()` (get-and-
 * delete) inside `agent.confirm()`, whose second call fails closed. Adopters who
 * want the projection mutation itself to be strictly atomic should wire a Lua
 * `EVAL` (compare-and-set on status); tracked as an ADR-136 follow-up.
 */

import type {
  ApprovalRegistry,
  ApprovalRequest,
  ApprovalStatus,
} from "./registry.js";

/**
 * Minimal Redis surface the adopter injects. Intentionally narrow so the
 * package does NOT hard-depend on a concrete client (node-redis, ioredis,
 * Upstash, …) — a 5-line wrapper of this shape adapts any of them.
 */
export interface ApprovalRedisClient {
  /** SET key=value with an expiry in SECONDS. */
  set(key: string, value: string, exSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  /**
   * Prefix-scoped key enumeration (glob pattern). Production clients back this
   * with SCAN (NOT the blocking `KEYS`). Bounded by `keyPrefix`. Required for
   * `list()`; a client without it makes `list()` return `[]`.
   */
  keys(pattern: string): Promise<readonly string[]>;
}

export interface CreateRedisApprovalRegistryOptions {
  readonly redis: ApprovalRedisClient;
  /** Key namespace. Default `"adjudicate:approval"`. */
  readonly keyPrefix?: string;
  /**
   * Default TTL (seconds) applied by `markResolved` (which re-SETs without a
   * caller-supplied TTL). Defaults to 24h, matching `ConfirmationStore.put`.
   */
  readonly ttlSeconds?: number;
  /** Injectable clock for deterministic tests. */
  readonly nowIso?: () => string;
}

const RESOLVED_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  "approved",
  "declined",
  "expired",
]);

/**
 * Redis-backed `ApprovalRegistry`. Same interface as the in-memory reference
 * (`put`/`get`/`list`/`markResolved`); never stores the envelope blob.
 */
export function createRedisApprovalRegistry(
  opts: CreateRedisApprovalRegistryOptions,
): ApprovalRegistry {
  const prefix = opts.keyPrefix ?? "adjudicate:approval";
  const defaultTtl = opts.ttlSeconds ?? 24 * 60 * 60;
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());

  const keyFor = (token: string): string => `${prefix}:req:${token}`;
  const listPattern = `${prefix}:req:*`;

  function parse(raw: string | null): ApprovalRequest | null {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as ApprovalRequest;
    } catch {
      return null;
    }
  }

  return {
    async put(req: ApprovalRequest, ttlSeconds: number): Promise<void> {
      // Persist ONLY the display projection — never an envelope blob (the
      // ApprovalRequest shape has no blob field, this is enforced structurally).
      await opts.redis.set(keyFor(req.token), JSON.stringify(req), ttlSeconds);
    },

    async get(token: string): Promise<ApprovalRequest | null> {
      return parse(await opts.redis.get(keyFor(token)));
    },

    async list(filter): Promise<ReadonlyArray<ApprovalRequest>> {
      const keys = await opts.redis.keys(listPattern);
      const raws = await Promise.all(keys.map((k) => opts.redis.get(k)));
      let rows = raws
        .map((r) => parse(r))
        .filter((r): r is ApprovalRequest => r !== null);
      if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
      if (filter?.sessionId)
        rows = rows.filter((r) => r.sessionId === filter.sessionId);
      // newest-first, matching the in-memory registry's contract.
      rows.sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
      if (filter?.limit !== undefined) rows = rows.slice(0, filter.limit);
      return rows;
    },

    async markResolved(
      token: string,
      status: "approved" | "declined" | "expired",
      by?: { id: string; displayName?: string },
      now?: string,
    ): Promise<ApprovalRequest | null> {
      const key = keyFor(token);
      const existing = parse(await opts.redis.get(key));
      if (existing === null) return null;
      // Idempotent re-resolve: an already-resolved projection is returned
      // unchanged (no second SET) so resolvedBy/resolvedAt stay stable. See the
      // residual-TOCTOU note in the module docblock.
      if (RESOLVED_STATUSES.has(existing.status)) return existing;
      const resolved: ApprovalRequest = {
        ...existing,
        status,
        resolvedAt: now ?? nowIso(),
        ...(by ? { resolvedBy: by } : {}),
      };
      await opts.redis.set(key, JSON.stringify(resolved), defaultTtl);
      return resolved;
    },
  };
}
