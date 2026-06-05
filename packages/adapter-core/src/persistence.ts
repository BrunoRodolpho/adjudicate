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

import type { IntentEnvelope } from "@adjudicate/core";

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
