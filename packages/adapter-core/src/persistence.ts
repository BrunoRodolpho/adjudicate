/**
 * In-memory persistence shims for the adapter loop.
 *
 * Two stores live here:
 * - **DeferRedis + ParkRedis** — implements the combined runtime persistence
 *   surface so `parkDeferredIntent` (write) and `resumeDeferredIntent`
 *   (read + idempotent claim) both work against a single backing object.
 *   Production wires real Redis; the in-memory shim is for tests + the
 *   quickstart.
 *
 * - **ConfirmationStore** — separate by design. DEFER persists by
 *   `(session, intentHash)`; REQUEST_CONFIRMATION persists by a
 *   user-held token (the user clicks "yes/no" at an arbitrary later time).
 *   Conflating them muddles both shapes.
 *
 * The persistence layer is provider-neutral — the `assistantHistorySnapshot`
 * on pending confirmations is typed as a generic `H` so adapters thread
 * their SDK's conversation-history shape through unchanged.
 */

import type { Capability, IntentEnvelope } from "@adjudicate/core";

// ── Defer / Park Redis surface ──────────────────────────────────────────────

/**
 * Read + claim surface used by `resumeDeferredIntent`. Mirrors the
 * `DeferRedis` interface in `@adjudicate/runtime`.
 */
export interface DeferRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null>;
  del(key: string): Promise<unknown>;
  incr?(key: string): Promise<number>;
  decr?(key: string): Promise<number>;
  expire?(key: string, seconds: number): Promise<unknown>;
}

/**
 * Write + counter surface used by `parkDeferredIntent`. Mirrors the
 * `ParkRedis` interface in `@adjudicate/runtime`.
 */
export interface ParkRedis {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number, mode?: "NX"): Promise<unknown>;
  set(
    key: string,
    value: string,
    options: { EX: number },
  ): Promise<string | null>;
  evalIncrCheck?(
    counterKey: string,
    ttlSeconds: number,
    max: number,
  ): Promise<number>;
}

interface Entry {
  readonly value: string;
  expiresAt: number;
}

/**
 * Opportunistic sweep batch size for `createInMemoryDeferStore` — evict at
 * most this many expired entries per write so the Map shrinks passively
 * without a background timer (MemoryReviewer-002, mirrors MemoryReviewer-001).
 */
const SWEEP_BATCH = 50;

/**
 * Combined in-memory implementation of `DeferRedis` AND `ParkRedis`.
 * Suitable for tests and the quickstart. NOT suitable for production —
 * lacks persistence, fan-out, and cross-process coordination.
 */
export function createInMemoryDeferStore(): DeferRedis & ParkRedis {
  const store = new Map<string, Entry>();
  const counters = new Map<string, number>();

  const isAlive = (entry: Entry | undefined): entry is Entry =>
    entry !== undefined && entry.expiresAt > Date.now();

  /**
   * MemoryReviewer-002: opportunistic eviction of expired `store` entries.
   * Entries never read again after expiry would otherwise persist for the
   * process lifetime; sweeping on each write keeps the Map bounded without a
   * timer. Bounded to `SWEEP_BATCH` per call so a large store doesn't make a
   * single `set` O(n). Live entries are never touched.
   */
  function sweepExpired(now: number): void {
    let evicted = 0;
    for (const [k, e] of store) {
      if (evicted >= SWEEP_BATCH) break;
      if (e.expiresAt <= now) {
        store.delete(k);
        evicted++;
      }
    }
  }

  function setRaw(
    key: string,
    value: string,
    options: { NX?: true; EX: number },
  ): "OK" | null {
    const now = Date.now();
    sweepExpired(now);
    const existing = store.get(key);
    if (options.NX && isAlive(existing)) return null;
    store.set(key, {
      value,
      expiresAt: now + options.EX * 1000,
    });
    return "OK";
  }

  return {
    async get(key) {
      const entry = store.get(key);
      if (!isAlive(entry)) {
        if (entry !== undefined) store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(
      key: string,
      value: string,
      options: { NX?: true; EX: number },
    ) {
      return setRaw(key, value, options);
    },
    async del(key) {
      const had = store.delete(key);
      counters.delete(key);
      return had ? 1 : 0;
    },
    async incr(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async decr(key) {
      const next = (counters.get(key) ?? 0) - 1;
      // MemoryReviewer-002: auto-delete the counter at zero. The defer-counter
      // is a reference count (incr on park, decr on resume); zero means no
      // parked defers remain for this session, so the key must not linger.
      if (next <= 0) {
        counters.delete(key);
        return 0;
      }
      counters.set(key, next);
      return next;
    },
    async expire(key: string, seconds: number, _mode?: "NX") {
      // MemoryReviewer-002: previously a no-op returning 1. Now refreshes the
      // TTL on the existing entry (Redis EXPIRE semantics). Missing key → 0.
      // The NX nuance is safely ignored: single-process TTL is advisory.
      const entry = store.get(key);
      if (entry === undefined) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
  };
}

// ── Confirmation store ──────────────────────────────────────────────────────

export interface PendingConfirmation<H = unknown> {
  readonly envelope: IntentEnvelope;
  readonly sessionId: string;
  readonly assistantHistorySnapshot: H;
  readonly toolUseId: string;
  readonly prompt: string;
}

/**
 * Persistence for REQUEST_CONFIRMATION pauses. `take()` is get-and-delete:
 * a confirmation token is single-use. A repeated take after the first
 * resolution returns `null` (idempotent yes-then-yes).
 */
export interface ConfirmationStore<H = unknown> {
  put(
    token: string,
    pending: PendingConfirmation<H>,
    ttlSeconds: number,
  ): Promise<void>;
  take(token: string): Promise<PendingConfirmation<H> | null>;
}

interface ConfirmationEntry<H> {
  readonly pending: PendingConfirmation<H>;
  readonly expiresAt: number;
}

export function createInMemoryConfirmationStore<H = unknown>(): ConfirmationStore<H> {
  const store = new Map<string, ConfirmationEntry<H>>();

  /**
   * MemoryReviewer-005: opportunistic sweep of expired entries. `take()`
   * only deletes the single token it reads, so confirmations that are never
   * redeemed (user walks away, token never clicked) would otherwise linger
   * past their TTL forever. Sweeping on `put` keeps the map bounded by the
   * set of *live* confirmations without needing a background timer (which
   * would keep the event loop alive in tests and short-lived processes).
   */
  function sweepExpired(now: number): void {
    for (const [token, entry] of store) {
      if (entry.expiresAt <= now) store.delete(token);
    }
  }

  return {
    async put(token, pending, ttlSeconds) {
      sweepExpired(Date.now());
      store.set(token, {
        pending,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    async take(token) {
      const entry = store.get(token);
      if (entry === undefined) return null;
      store.delete(token);
      if (entry.expiresAt <= Date.now()) return null;
      return entry.pending;
    },
  };
}

// ─── BurnStore (single-use capability burn, 022) ─────────────────────────────

/**
 * Single-use capability "burn" store (022) — the AUTHORIZATION-BEARING
 * at-most-once redemption primitive a cap-gated executor (024) consumes.
 *
 * Unlike the lossy display-only approval registry and unlike
 * `ConfirmationStore` (which is a transport for a user-held token), this store
 * OWNS the single-use guarantee for a kernel-minted `Capability` (021): a
 * capability minted on EXECUTE may be redeemed EXACTLY ONCE before its executor
 * honors it. It mirrors the `ConfirmationStore.take` single-use contract above
 * — get-and-delete, idempotent yes-then-yes, TTL-expiring — but it is
 * authoritative, not display-only.
 *
 * **Atomicity — the headline guarantee.** `burn(nonce)` is a single
 * claim-and-burn primitive: the read of the bound record AND the delete that
 * consumes it are ONE atomic step. The in-memory reference is atomic within the
 * single-threaded event loop (the read+delete is synchronous between `await`
 * points); the Redis backing (`createRedisBurnStore`, `persistence-redis.ts`)
 * makes it atomic ACROSS replicas with a Lua `EVAL` get-and-delete, closing the
 * non-atomic GET-then-DEL double-spend race the production confirmation store
 * documents. A non-atomic GET-then-DEL would let two concurrent `burn(nonce)`
 * calls both observe the same pending grant (double-spend) — the burn store
 * forbids that.
 *
 * **Fail-closed (§D #6 / index §C).** A burn MISS (key absent), an EXPIRED
 * grant (past TTL), or a store/IO error yields NO redemption (`null` /
 * rejection) — never a fail-open grant. Removing the store cannot loosen any
 * guard: no guard authorizes on a SUCCESSFUL burn (the burn gates an executor,
 * not a kernel decision), so the failure mode is friction, never bypass.
 *
 * Generic over the bound record `R` (defaults to `Capability`) so 024 can store
 * whatever grant shape it redeems while keeping the interface reusable.
 */
export interface BurnStore<R = Capability> {
  /**
   * Persist a single-use, claimable grant keyed by `nonce` with a TTL. Writing
   * is first-writer-wins (mirroring the `Ledger` `"acquired"`/`"exists"`
   * idempotent-claim, `core/src/ledger.ts`): a second `mint` of a LIVE key is
   * suppressed and returns `false`, so a grant cannot be silently overwritten
   * (which would otherwise resurrect an already-burned single-use key). Returns
   * `true` when the grant was claimed, `false` when the key is already live.
   */
  mint(nonce: string, record: R, ttlSeconds: number): Promise<boolean>;
  /**
   * Atomically claim-and-burn the grant bound to `nonce`. Returns the bound
   * record EXACTLY ONCE; every subsequent `burn(nonce)` returns `null`
   * (idempotent yes-then-yes, single-use). Returns `null` for an unknown nonce
   * and for an EXPIRED grant (fail-closed past TTL). The read and the burn are
   * one atomic step — no GET-then-DEL race.
   */
  burn(nonce: string): Promise<R | null>;
}

interface BurnEntry<R> {
  readonly record: R;
  readonly expiresAt: number;
}

/**
 * In-memory reference `BurnStore` (022 T1). Atomic single-use within the
 * single-threaded event loop: `burn` reads, validates TTL, and deletes
 * synchronously between `await` points, so two `burn(nonce)` calls cannot both
 * observe the same live grant — exactly the `ConfirmationStore.take` single-use
 * contract, but authoritative. Opportunistic `sweepExpired` on `mint` bounds the
 * map without a background timer (mirrors `createInMemoryConfirmationStore`,
 * MemoryReviewer-005). Suitable for tests + quickstart; NOT for cross-process
 * production (use `createRedisBurnStore`).
 */
export function createInMemoryBurnStore<R = Capability>(): BurnStore<R> {
  const store = new Map<string, BurnEntry<R>>();

  const isLive = (entry: BurnEntry<R> | undefined): entry is BurnEntry<R> =>
    entry !== undefined && entry.expiresAt > Date.now();

  function sweepExpired(now: number): void {
    for (const [nonce, entry] of store) {
      if (entry.expiresAt <= now) store.delete(nonce);
    }
  }

  return {
    async mint(nonce, record, ttlSeconds) {
      sweepExpired(Date.now());
      // First-writer-wins: never overwrite a LIVE grant (that could resurrect
      // an already-claimed single-use key). An expired key is reclaimable.
      if (isLive(store.get(nonce))) return false;
      store.set(nonce, {
        record,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return true;
    },
    async burn(nonce) {
      // Atomic claim-and-burn: read + delete happen synchronously here, with no
      // `await` between them, so two concurrent burns of the same nonce cannot
      // both win. The single delete consumes the grant exactly once.
      const entry = store.get(nonce);
      if (entry === undefined) return null;
      store.delete(nonce);
      // Fail-closed on expiry: a grant past its TTL is never honored (§D #6).
      if (entry.expiresAt <= Date.now()) return null;
      return entry.record;
    },
  };
}

// ─── MemoryStore (cross-session planner memory, ADR-126 + lifecycle addendum) ─

/**
 * A memory value paired with its optimistic-concurrency version. `version` is
 * monotonic per key; `0` means the key is absent. Used by the CAS seam
 * (`getVersioned`/`putIfVersion`) to make concurrent writebacks safe.
 */
export interface VersionedMemory<M = unknown> {
  readonly value: M;
  readonly version: number;
}

/**
 * Cross-session memory store. Read-many (non-destructive `get`), unlike the
 * single-use `ConfirmationStore.take`. Used ONLY to enrich the planner/renderer
 * context — never the kernel decision (see loop `resolveContext`).
 *
 * FIREWALL — memory is **NOT audit evidence** (ADR-126 lifecycle addendum). It
 * never enters `intentHash`, state `S`, any guard, the taint gate, or the
 * `auditHash` pre-image. It is mutable and fail-open by design, and is never
 * replayed; routing a memory value into the decision path would silently break
 * deterministic replay. Treat it as best-effort prompt context only.
 */
export interface MemoryStore<M = unknown> {
  get(sessionId: string): Promise<M | null>;
  put(sessionId: string, memory: M, ttlSeconds: number): Promise<void>;
  merge?(sessionId: string, patch: Partial<M>, ttlSeconds: number): Promise<M>;
  /**
   * Optimistic-concurrency read: the value (or `null`) plus the current
   * version (`0` when absent). Optional — backends without versioning omit it
   * and callers fall back to `get`/`put`. Out of the decision path like `get`.
   */
  getVersioned?(sessionId: string): Promise<VersionedMemory<M | null>>;
  /**
   * Compare-and-set write: applies only if the stored version equals
   * `expectedVersion`. Returns the new version on success, or `null` on a
   * version conflict (the caller should re-read and retry). Never throws on
   * conflict. Optional companion to `getVersioned`.
   */
  putIfVersion?(
    sessionId: string,
    memory: M,
    expectedVersion: number,
    ttlSeconds: number,
  ): Promise<number | null>;
}

export interface CreateInMemoryMemoryStoreOptions {
  readonly defaultTtlSeconds?: number;
  /**
   * Hard cap on live entries. When `put`/`putIfVersion` would exceed it, the
   * least-recently-used entry is evicted (Map insertion order; `get`/`put`
   * bump recency). Bounds growth for long-lived processes. Default: unbounded.
   */
  readonly maxEntries?: number;
  /**
   * Namespacing transform applied to `sessionId` before it is used as the map
   * key — for cross-tenant isolation and symmetry with the Redis store's
   * `keyFor`. Default: identity.
   */
  readonly keyFor?: (sessionId: string) => string;
}

/**
 * In-memory reference MemoryStore. Non-destructive get; opportunistic TTL
 * sweep; optional `maxEntries` LRU cap, `keyFor` namespacing, and CAS.
 */
export function createInMemoryMemoryStore<M = unknown>(
  opts: CreateInMemoryMemoryStoreOptions = {},
): MemoryStore<M> {
  const store = new Map<string, { value: M; expiresAt: number; version: number }>();
  const defaultTtl = opts.defaultTtlSeconds ?? 24 * 60 * 60;
  const keyFor = opts.keyFor ?? ((s: string) => s);
  const maxEntries = opts.maxEntries;

  function sweep(): void {
    const now = Date.now();
    let n = 0;
    for (const [k, e] of store) {
      if (e.expiresAt <= now) store.delete(k);
      if (++n >= SWEEP_BATCH) break;
    }
  }
  // Evict least-recently-used (oldest in insertion order) until within cap.
  function evictIfNeeded(): void {
    if (maxEntries === undefined) return;
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }
  // Read a live (non-expired) entry, expiring stale ones, and bump recency by
  // re-inserting at the tail so insertion order tracks LRU.
  function readLive(key: string): { value: M; expiresAt: number; version: number } | null {
    const e = store.get(key);
    if (e === undefined) return null;
    if (e.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    store.delete(key);
    store.set(key, e);
    return e;
  }

  const self: MemoryStore<M> = {
    async get(sessionId) {
      const e = readLive(keyFor(sessionId));
      return e === null ? null : e.value;
    },
    async put(sessionId, memory, ttlSeconds) {
      sweep();
      const key = keyFor(sessionId);
      const prev = store.get(key);
      store.delete(key); // re-insert at tail (recency)
      store.set(key, {
        value: memory,
        expiresAt: Date.now() + (ttlSeconds || defaultTtl) * 1000,
        version: (prev?.version ?? 0) + 1,
      });
      evictIfNeeded();
    },
    async merge(sessionId, patch, ttlSeconds) {
      const current = (await self.get(sessionId)) ?? ({} as M);
      const merged = { ...current, ...patch } as M;
      await self.put(sessionId, merged, ttlSeconds);
      return merged;
    },
    async getVersioned(sessionId) {
      const e = readLive(keyFor(sessionId));
      return e === null
        ? { value: null, version: 0 }
        : { value: e.value, version: e.version };
    },
    async putIfVersion(sessionId, memory, expectedVersion, ttlSeconds) {
      sweep();
      const key = keyFor(sessionId);
      const live = readLive(key);
      const currentVersion = live?.version ?? 0;
      if (currentVersion !== expectedVersion) return null; // conflict
      const newVersion = currentVersion + 1;
      store.delete(key);
      store.set(key, {
        value: memory,
        expiresAt: Date.now() + (ttlSeconds || defaultTtl) * 1000,
        version: newVersion,
      });
      evictIfNeeded();
      return newVersion;
    },
  };
  return self;
}
