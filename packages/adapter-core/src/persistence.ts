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

import type {
  Capability,
  IntentEnvelope,
  SessionContamination,
} from "@adjudicate/core";

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
  // 025 — per-counter expiry (ms epoch) for the `evalIncrCheck` budget primitive,
  // so a window past its TTL refills (Redis EXPIRE on the counter key).
  const counterExpiry = new Map<string, number>();

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
      counterExpiry.delete(key);
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
    // 025 — atomic INCREMENT-and-check, the budget burn-down primitive. Mirrors
    // the Redis `evalIncrCheck` Lua contract: increment the counter, and if it
    // would exceed `max` roll the increment back and return `0` (over-limit);
    // otherwise return the new count (`>= 1`). Atomic WITHIN the single-threaded
    // event loop (no `await` between the read and the write), so two concurrent
    // `evalIncrCheck` calls cannot both push the counter past `max` — exactly the
    // at-most-`max` guarantee `createBudgetStore` relies on. The counter TTL is
    // (re)set on every increment so the window refills naturally.
    async evalIncrCheck(counterKey: string, ttlSeconds: number, max: number) {
      const now = Date.now();
      const expired = counterExpiry.get(counterKey);
      // Window expiry: a counter past its TTL refills (start fresh).
      const base =
        expired !== undefined && expired <= now ? 0 : counters.get(counterKey) ?? 0;
      const next = base + 1;
      if (next > max) {
        // Over-limit: do NOT advance the counter (the Lua script DECRs the
        // speculative increment back). Return 0 = over-limit (fail-closed).
        counters.set(counterKey, base);
        return 0;
      }
      counters.set(counterKey, next);
      counterExpiry.set(counterKey, now + ttlSeconds * 1000);
      return next;
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

// ─── BudgetStore (capabilities-as-budgets, 025) ──────────────────────────────

/**
 * Authoritative, single-use-COUNTED budget burn-down store (025 —
 * capabilities-as-budgets). The IMPURE-shell authority over a human-granted,
 * BOUNDED, STANDING pre-authorization: it METERS at-most-`limit` threshold
 * substitutions per `intentKind` within a rolling window, so a class of intents
 * can satisfy the "ask first" threshold WITHOUT a per-intent confirmation
 * receipt — up to the declared ceiling.
 *
 * **Justified DISTINCT store (vs 022 BurnStore).** This is a deliberately
 * different primitive from the single-use `BurnStore`:
 *   - `BurnStore.burn(nonce)` BURNS a single capability token (claim-and-delete,
 *     atomic Lua GET+DEL) — at-most-ONCE.
 *   - `BudgetStore.tryBurnDown(...)` METERS N substitutions against a `limit`
 *     (atomic Lua INCREMENT-and-check, `evalIncrCheck`) — at-most-`limit`.
 * A per-token burn cannot express an N-use budget, so 022 is NOT reused; the two
 * are different mechanisms for different jobs, each authoritative for its own
 * scope.
 *
 * **Atomicity — the headline guarantee (plan §3 / §6).** `tryBurnDown` decrements
 * the budget via the atomic `evalIncrCheck` Lua primitive (`ParkRedis`,
 * `defer-park`): the increment AND the limit check are ONE indivisible step, so
 * concurrent burn-downs over a `limit`-N budget yield AT MOST N grants across
 * replicas. This deliberately does NOT mirror the non-atomic GET+DEL caveat the
 * production confirmation store documents (`persistence-redis.ts`) — copying that
 * sequence would re-introduce the over-grant race this store exists to close.
 *
 * **Authority stays OUT of the lossy projection.** The authoritative counter
 * lives here, in the single-use-counted store — NEVER the lossy display-only
 * approval registry (`approval-engine/registry-redis.ts`, which never stores the
 * authoritative envelope). The shell asserts a kernel budget grant ONLY after
 * `tryBurnDown` returns `true`.
 *
 * **Fail-closed (§D #6 / index §C).** Over-limit, an expired/refilled window
 * miscount, or a store/IO error yields NO grant (`false` / rejection) — the
 * kernel then returns the original REQUEST_CONFIRMATION (friction, never bypass).
 * Removing the store cannot loosen any guard: no guard authorizes on a successful
 * burn-down (it gates a threshold substitution, not a state/taint/auth/business
 * guard).
 */
export interface BudgetStore {
  /**
   * Atomically burn down ONE unit of the budget for `(budgetId, intentKind)`
   * against `limit`, expiring the counter under `windowSeconds`. Returns:
   *   - `true`  — the decrement stayed AT OR UNDER `limit`; the caller MAY assert
   *               the kernel budget grant for this substitution.
   *   - `false` — the budget is exhausted for this window (over `limit`), so NO
   *               grant is asserted (fail-closed to friction). The atomic
   *               primitive has already rolled the over-limit increment back.
   *
   * The read-modify-write is ONE atomic step (the `evalIncrCheck` Lua eval), so
   * concurrent calls cannot both push the counter past `limit` (at-most-`limit`).
   */
  tryBurnDown(input: {
    readonly budgetId: string;
    readonly intentKind: string;
    readonly limit: number;
    readonly windowSeconds: number;
  }): Promise<boolean>;
}

/**
 * Construct a `BudgetStore` backed by a `ParkRedis`-shaped client's ATOMIC
 * `evalIncrCheck` Lua primitive (`persistence.ts` `ParkRedis.evalIncrCheck`,
 * declared HERE, exercised by `defer-park`). The counter key namespaces the
 * grant by `(budgetId, intentKind)` so two grants never share a counter.
 *
 * `evalIncrCheck(counterKey, ttlSeconds, max)` returns `0` when the increment
 * would exceed `max` (the Lua script already DECR'd back — atomic), or the new
 * count (`>= 1`) otherwise. So `result !== 0` ⇔ the substitution is in-budget.
 * The `evalIncrCheck` hook is REQUIRED for this store: a single-use-COUNTED
 * authority store has NO safe non-atomic fallback (a bare INCR→check→DECR would
 * re-introduce the over-grant race), so a client without it throws at
 * construction — exactly the fail-closed posture (§D #6).
 */
export function createBudgetStore(opts: {
  readonly client: Pick<ParkRedis, "evalIncrCheck">;
  /**
   * Key namespacer — Adjudicate convention wraps the raw suffix into a
   * tenant/env-namespaced key (e.g. `${APP_ENV}:adjudicate:${suffix}`).
   * Defaults to identity.
   */
  readonly keyFor?: (suffix: string) => string;
}): BudgetStore {
  if (typeof opts.client.evalIncrCheck !== "function") {
    throw new Error(
      "[adjudicate] createBudgetStore requires an atomic `evalIncrCheck` Lua " +
        "primitive — a single-use-counted budget store has no safe non-atomic " +
        "fallback (a bare INCR→check→DECR would re-introduce the over-grant race).",
    );
  }
  const evalIncrCheck = opts.client.evalIncrCheck.bind(opts.client);
  const keyFor = opts.keyFor ?? ((s: string) => s);
  return {
    async tryBurnDown({ budgetId, intentKind, limit, windowSeconds }) {
      // Per-grant counter key. Including `intentKind` is belt-and-suspenders:
      // the kernel already scopes substitution to `envelope.kind === intentKind`,
      // and `budgetId` is unique per grant, but keying by both makes a single
      // counter authoritative for exactly one (grant, kind) pair.
      const counterKey = keyFor(`budget:${budgetId}:${intentKind}`);
      // Atomic increment-and-check. `0` ⇒ over-limit (already rolled back by the
      // Lua script) ⇒ NOT in-budget ⇒ no grant. Any value `>= 1` ⇒ in-budget.
      const result = await evalIncrCheck(counterKey, windowSeconds, limit);
      return result !== 0;
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

// ── Session-contamination store (042 / H4) ──────────────────────────────────

/**
 * 042 / H4 — durable, session-scoped store for the contamination flag.
 *
 * The contamination flag (`SessionContamination`, set when an untrusted-origin
 * datum entered the session) is SESSION-scoped, but the laundered datum it
 * guards is appended to session-scoped conversation history that is re-supplied
 * across turns. Holding the flag only in a turn-local variable (the pre-H4
 * loop) let a multi-turn launder slip the origin gate: contaminate on turn 1,
 * propose off the poisoned history on turn 2 — minted clean because turn 2's
 * variable started `undefined`. This store gives the loop a place to PERSIST the
 * flag across turns so the gate sees it on every subsequent turn.
 *
 * FIREWALL (mirrors `MemoryStore`): this is an IMPURE-SHELL store, NOT a kernel
 * input. The flag it holds is folded into the minted taint at the
 * envelope-minting seam BEFORE the `intentHash` is computed (so it IS inside the
 * hashed pre-image, invariant #4), but the store itself never enters the kernel
 * decision, state `S`, or the `auditHash` pre-image, and is never replayed.
 *
 * MONOTONIC (§C / invariant #7): the only mutator the loop calls is `put` with
 * the meet-folded flag (`contaminateSession`), which can only LOWER trust. The
 * sole trust-RAISING operation is `clear`, which the loop invokes ONLY on the
 * adopter-authenticated `resume()` path — never from an LLM action.
 */
export interface SessionContaminationStore {
  /** Load the persisted flag for a session (`null` when uncontaminated). */
  get(sessionId: string): Promise<SessionContamination | null>;
  /**
   * Persist the (monotonically meet-folded) flag for a session. Callers MUST
   * only ever `put` a flag whose trust is ≤ the currently-stored flag's (the
   * loop folds via `contaminateSession` from the loaded value, guaranteeing it).
   */
  put(
    sessionId: string,
    contamination: SessionContamination,
    ttlSeconds: number,
  ): Promise<void>;
  /**
   * Drop the flag for a session — the trust-RAISING operation. The loop calls
   * this ONLY on the authenticated `resume()` path (never an LLM action).
   */
  clear(sessionId: string): Promise<void>;
}

export interface CreateInMemorySessionContaminationStoreOptions {
  readonly defaultTtlSeconds?: number;
  /** Namespacing transform applied to `sessionId` (cross-tenant isolation). */
  readonly keyFor?: (sessionId: string) => string;
}

/**
 * In-memory reference `SessionContaminationStore` (tests + quickstart). TTL'd,
 * with an opportunistic sweep. Production wires Redis with the same surface.
 */
export function createInMemorySessionContaminationStore(
  opts: CreateInMemorySessionContaminationStoreOptions = {},
): SessionContaminationStore {
  const store = new Map<string, { value: SessionContamination; expiresAt: number }>();
  const defaultTtl = opts.defaultTtlSeconds ?? 24 * 60 * 60;
  const keyFor = opts.keyFor ?? ((s: string) => s);

  function sweep(): void {
    const now = Date.now();
    let n = 0;
    for (const [k, e] of store) {
      if (e.expiresAt <= now) store.delete(k);
      if (++n >= SWEEP_BATCH) break;
    }
  }

  return {
    async get(sessionId) {
      const key = keyFor(sessionId);
      const e = store.get(key);
      if (e === undefined) return null;
      if (e.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async put(sessionId, contamination, ttlSeconds) {
      sweep();
      store.set(keyFor(sessionId), {
        value: contamination,
        expiresAt: Date.now() + (ttlSeconds || defaultTtl) * 1000,
      });
    },
    async clear(sessionId) {
      store.delete(keyFor(sessionId));
    },
  };
}
