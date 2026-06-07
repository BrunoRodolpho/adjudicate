/**
 * Redis-backed `ConfirmationStore` — restart-durable pending confirmations.
 *
 * The in-memory `createInMemoryConfirmationStore` (see `./persistence.ts`)
 * is suitable for tests and the quickstart, but a process restart loses
 * every pending confirmation. Adopters running the adapter loop in a
 * production process need restart durability so user-held tokens
 * (REQUEST_CONFIRMATION flows that block for hours) survive deploys.
 *
 * This module ships a Redis-backed implementation that uses the same
 * minimal `RedisLedgerClient` surface (`get`/`set`) as the rest of the
 * audit + ledger stack. The store is generic over `H` (the conversation-
 * history shape) — the caller supplies a serializer for their provider's
 * history type.
 *
 * # Wire format
 *
 * Each pending confirmation is JSON-encoded under the key
 * `${prefix}:confirm:${token}`. The TTL on the key matches the
 * adopter-supplied `ttlSeconds` from `put()`.
 *
 * # Get-and-delete (take semantics)
 *
 * `take()` is single-use: a successful take deletes the key. Two
 * concurrent `take(token)` calls race — Redis `GET` + `DEL` is not atomic
 * without scripting, so at most one caller receives the pending
 * confirmation. Production adopters needing strict at-most-once semantics
 * across replicas should wire a Lua script; the JS implementation here
 * accepts a tiny race window where two `take` calls might both return
 * the same pending (the LATER one's adjudication then fails on
 * `REPLAY_SUPPRESSED` via the kernel's ledger — fail-closed by design).
 *
 * # Replay safety
 *
 * Confirmation tokens are NOT inputs to the kernel's adjudication —
 * they're externally-held opaque references. The kernel's
 * `confirmationReceipt` (which IS adjudicated against) is reconstructed
 * from the persisted envelope, not from the token. So storing them in
 * Redis does not change replay determinism.
 */

import type { IntentEnvelope } from "@adjudicate/core";
import type {
  ConfirmationStore,
  MemoryStore,
  PendingConfirmation,
} from "./persistence.js";

/**
 * Minimal Redis surface required by the Redis confirmation store. Same
 * shape as `@adjudicate/audit`'s `RedisLedgerClient` so adopters can
 * reuse the same connection.
 */
export interface ConfirmationRedisClient {
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number },
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface CreateRedisConfirmationStoreOptions<H> {
  readonly client: ConfirmationRedisClient;
  /**
   * Adopter-supplied key namespacer. Adjudicate convention: wrap the
   * raw suffix into a tenant/env-namespaced key (e.g.,
   * `${APP_ENV}:adjudicate:${suffix}`). Defaults to identity.
   */
  readonly keyFor?: (suffix: string) => string;
  /**
   * Serializer for the assistant history snapshot. Required because `H`
   * is the provider's opaque history shape — Anthropic's MessageParam[]
   * and OpenAI's ChatCompletionMessageParam[] are both JSON-serializable
   * by default. Adopters who use richer types (Date, BigInt) should plug
   * in a custom serializer.
   *
   * Default: `JSON.stringify` / `JSON.parse`.
   */
  readonly serializeHistory?: (h: H) => string;
  readonly deserializeHistory?: (s: string) => H;
}

interface WireFormat {
  readonly envelope: IntentEnvelope;
  readonly sessionId: string;
  readonly historyJson: string;
  readonly toolUseId: string;
  readonly prompt: string;
}

/**
 * Redis-backed `ConfirmationStore<H>`. Wraps the minimal `set/get/del`
 * surface. `put` writes with EX (TTL); `take` does GET then DEL.
 *
 * Adopters share the underlying Redis client across the ledger, the
 * kill switch, and the confirmation store — one connection per role
 * (read/write vs subscribe) is the typical production wiring.
 */
export function createRedisConfirmationStore<H = unknown>(
  opts: CreateRedisConfirmationStoreOptions<H>,
): ConfirmationStore<H> {
  const keyFor = opts.keyFor ?? ((s: string) => s);
  const serialize =
    opts.serializeHistory ?? ((h: H) => JSON.stringify(h));
  const deserialize =
    opts.deserializeHistory ?? ((s: string) => JSON.parse(s) as H);

  return {
    async put(
      token: string,
      pending: PendingConfirmation<H>,
      ttlSeconds: number,
    ) {
      const wire: WireFormat = {
        envelope: pending.envelope,
        sessionId: pending.sessionId,
        historyJson: serialize(pending.assistantHistorySnapshot),
        toolUseId: pending.toolUseId,
        prompt: pending.prompt,
      };
      await opts.client.set(
        keyFor(`confirm:${token}`),
        JSON.stringify(wire),
        { EX: ttlSeconds },
      );
    },

    async take(token: string) {
      const key = keyFor(`confirm:${token}`);
      const raw = await opts.client.get(key);
      if (raw === null) return null;
      // Get-and-delete: a single use. Concurrent takes may race; the
      // kernel's ledger backstops with REPLAY_SUPPRESSED on the second
      // adjudication.
      await opts.client.del(key);
      let wire: WireFormat;
      try {
        wire = JSON.parse(raw) as WireFormat;
      } catch {
        return null;
      }
      let history: H;
      try {
        history = deserialize(wire.historyJson);
      } catch {
        return null;
      }
      return {
        envelope: wire.envelope,
        sessionId: wire.sessionId,
        assistantHistorySnapshot: history,
        toolUseId: wire.toolUseId,
        prompt: wire.prompt,
      };
    },
  };
}

// ─── Redis MemoryStore (ADR-126) ────────────────────────────────────────────

export interface CreateRedisMemoryStoreOptions<M> {
  readonly client: ConfirmationRedisClient;
  readonly keyFor?: (sessionId: string) => string;
  readonly serialize?: (m: M) => string;
  readonly deserialize?: (s: string) => M;
  readonly defaultTtlSeconds?: number;
}

/** Redis-backed MemoryStore. Non-destructive get; SET EX put; non-atomic merge. */
export function createRedisMemoryStore<M = unknown>(
  opts: CreateRedisMemoryStoreOptions<M>,
): MemoryStore<M> {
  const keyFor = opts.keyFor ?? ((s: string) => `adjudicate:memory:${s}`);
  const serialize = opts.serialize ?? ((m: M) => JSON.stringify(m));
  const deserialize = opts.deserialize ?? ((s: string) => JSON.parse(s) as M);
  const defaultTtl = opts.defaultTtlSeconds ?? 24 * 60 * 60;
  const store: MemoryStore<M> = {
    async get(sessionId) {
      const raw = await opts.client.get(keyFor(sessionId));
      if (raw === null) return null;
      try {
        return deserialize(raw);
      } catch {
        return null;
      }
    },
    async put(sessionId, memory, ttlSeconds) {
      await opts.client.set(keyFor(sessionId), serialize(memory), { EX: ttlSeconds || defaultTtl });
    },
    async merge(sessionId, patch, ttlSeconds) {
      const current = (await store.get(sessionId)) ?? ({} as M);
      const merged = { ...current, ...patch } as M;
      await store.put(sessionId, merged, ttlSeconds);
      return merged;
    },
  };
  return store;
}
