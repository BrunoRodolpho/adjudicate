/**
 * In-memory persistence shims for the agent.
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
 */

import type { IntentEnvelope } from "@adjudicate/core";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

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
  expiresAt: number; // ms epoch; Infinity for no-expiry
}

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

  function setRaw(
    key: string,
    value: string,
    options: { NX?: true; EX: number },
  ): "OK" | null {
    const existing = store.get(key);
    if (options.NX && isAlive(existing)) return null;
    store.set(key, {
      value,
      expiresAt: Date.now() + options.EX * 1000,
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
      counters.set(key, next);
      return next;
    },
    async expire(_key: string, _seconds: number, _mode?: "NX") {
      // Counter TTLs are best-effort no-ops in the in-memory shim. Real
      // Redis honors EXPIRE; the runtime layer's safety relies on TTL,
      // but tests use bounded scenarios so the no-op is acceptable.
      return 1;
    },
    // ParkRedis.evalIncrCheck — left absent; the framework falls back to
    // INCR + EXPIRE + check sequence, which is correct under in-memory
    // single-threaded execution.
  };
}

// ── Confirmation store ──────────────────────────────────────────────────────

export interface PendingConfirmation {
  readonly envelope: IntentEnvelope;
  readonly sessionId: string;
  readonly assistantHistorySnapshot: ReadonlyArray<MessageParam>;
  readonly toolUseId: string;
  readonly prompt: string;
}

/**
 * Persistence for REQUEST_CONFIRMATION pauses. `take()` is get-and-delete:
 * a confirmation token is single-use. A repeated take after the first
 * resolution returns `null` (idempotent yes-then-yes).
 */
export interface ConfirmationStore {
  put(
    token: string,
    pending: PendingConfirmation,
    ttlSeconds: number,
  ): Promise<void>;
  take(token: string): Promise<PendingConfirmation | null>;
}

interface ConfirmationEntry {
  readonly pending: PendingConfirmation;
  readonly expiresAt: number;
}

export function createInMemoryConfirmationStore(): ConfirmationStore {
  const store = new Map<string, ConfirmationEntry>();
  return {
    async put(token, pending, ttlSeconds) {
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
