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

import type { Capability, IntentEnvelope } from "@adjudicate/core";
import { reconcileNonceHash, timingSafeHexEqual } from "@adjudicate/core";
import type {
  BurnStore,
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

// ─── Redis BurnStore (single-use capability burn, 022 T2) ────────────────────

/**
 * The Lua claim-and-burn script — the HEADLINE atomicity fix (022).
 *
 * A single-use authorization store cannot use a non-atomic GET-then-DEL: two
 * concurrent `burn(nonce)` calls would both `GET` the same pending grant before
 * either `DEL`s it, so BOTH redeem (double-spend). Redis evaluates a Lua script
 * ATOMICALLY (single-threaded, no interleaving with other commands), so reading
 * the value AND deleting it inside one `EVAL` is one indivisible step: the FIRST
 * burn returns the value and removes the key; every concurrent/subsequent burn
 * sees the key already gone and returns `nil`. At-most-once holds across
 * replicas WITHOUT relying on the kernel-ledger `REPLAY_SUPPRESSED` backstop.
 *
 *     local v = redis.call('GET', KEYS[1])
 *     if v then redis.call('DEL', KEYS[1]) end
 *     return v
 *
 * Returns the stored JSON string on the winning burn, `nil` (→ `null`) on every
 * other. Expiry is enforced by Redis itself: an EX-expired key is already gone,
 * so `GET` returns `nil` and the burn fails closed.
 */
export const BURN_CLAIM_AND_BURN_LUA =
  "local v = redis.call('GET', KEYS[1])\n" +
  "if v then redis.call('DEL', KEYS[1]) end\n" +
  "return v";

/**
 * Minimal Redis surface for the single-use burn store. `set` claims the grant
 * (SET NX EX, first-writer-wins); `eval` runs the atomic Lua claim-and-burn.
 *
 * `eval` is REQUIRED (not optional like defer-park's `evalIncrCheck`): a
 * single-use authorization store has NO safe non-atomic fallback — a GET+DEL
 * fallback would reintroduce the double-spend race the store exists to close.
 * Adopters wire their client's Lua `EVAL`:
 *   - node-redis v4: `client.eval(script, { keys, arguments })`
 *   - ioredis:       `client.eval(script, keys.length, ...keys, ...args)`
 * Either way `evalGetDel(script, key)` must execute `script` with `KEYS[1] =
 * key` atomically and return the script's result (the stored string or `null`).
 */
export interface BurnRedisClient {
  set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number },
  ): Promise<string | null>;
  /**
   * Run the atomic Lua claim-and-burn (`BURN_CLAIM_AND_BURN_LUA`) against a
   * single key. Returns the stored string on the winning burn, `null`
   * otherwise. MUST be the Redis `EVAL` path (atomic), never a JS GET-then-DEL.
   */
  evalGetDel(script: string, key: string): Promise<string | null>;
}

export interface CreateRedisBurnStoreOptions<R> {
  readonly client: BurnRedisClient;
  /**
   * Key namespacer — Adjudicate convention wraps the raw suffix into a
   * tenant/env-namespaced key (e.g. `${APP_ENV}:adjudicate:${suffix}`).
   * Defaults to identity.
   */
  readonly keyFor?: (suffix: string) => string;
  readonly serialize?: (record: R) => string;
  readonly deserialize?: (raw: string) => R;
}

/**
 * Redis-backed single-use `BurnStore<R>` (022 T2). `mint` claims the grant with
 * `SET NX EX` (first-writer-wins, mirroring `Ledger.recordExecution` and
 * `defer-resume`'s `acquired !== "OK"` suppression); `burn` runs the ATOMIC Lua
 * `EVAL` get-and-delete (`BURN_CLAIM_AND_BURN_LUA`) so two concurrent burns of
 * the same nonce cannot both win — closing the non-atomic GET+DEL double-spend
 * race the production confirmation store documents (`persistence-redis.ts`
 * `take`). Fail-closed (§D #6): a burn miss, an EX-expired key (gone in Redis),
 * a malformed blob, or a store/IO error yields NO redemption (`null` /
 * rejection), never a fail-open grant.
 */
export function createRedisBurnStore<R = Capability>(
  opts: CreateRedisBurnStoreOptions<R>,
): BurnStore<R> {
  const keyFor = opts.keyFor ?? ((s: string) => s);
  const serialize = opts.serialize ?? ((r: R) => JSON.stringify(r));
  const deserialize = opts.deserialize ?? ((s: string) => JSON.parse(s) as R);
  const key = (nonce: string) => keyFor(`burn:${nonce}`);

  return {
    async mint(nonce, record, ttlSeconds) {
      // First-writer-wins: SET NX so a second mint of a live key is suppressed
      // (cannot resurrect / overwrite an in-flight single-use grant). EX bounds
      // the key so an unredeemed grant garbage-collects (and fails closed past
      // TTL — an expired key is gone, so a later burn returns null).
      const acquired = await opts.client.set(key(nonce), serialize(record), {
        NX: true,
        EX: ttlSeconds,
      });
      return acquired === "OK";
    },
    async burn(nonce) {
      // ATOMIC claim-and-burn — the read AND the delete happen inside one Redis
      // EVAL, so concurrent burns of the same nonce cannot both observe the
      // pending grant. No bare GET-then-DEL here (that is the race we close).
      const raw = await opts.client.evalGetDel(BURN_CLAIM_AND_BURN_LUA, key(nonce));
      if (raw === null) return null; // miss, expired (gone), or lost the race
      try {
        return deserialize(raw);
      } catch {
        // Malformed blob → fail closed (no redemption), never throw.
        return null;
      }
    },
  };
}

/**
 * Nonce reconciliation (022 T3, Redis-side) — re-derive the nonce-bound
 * `intentHash` for the envelope a caller presents and constant-time-compare it
 * against the `intentHash` the burned `Capability` was minted against, BEFORE
 * honoring the burn (plan §3). Reuses the kernel's canonical recipe via
 * `reconcileNonceHash` (which re-derives via `deriveIntentHash` over the
 * untouched `intentHashInput` pre-image and compares via `timingSafeHexEqual`,
 * constant-time, fail-closed). A mutated nonce (or any tampered hashed field)
 * re-derives a different hash → `false`, so the burned grant is NOT honored.
 *
 * Belt-and-suspenders: also constant-time-compares the capability's bound
 * `intentHash` against the envelope's stored `intentHash` (both already
 * verified strings) via `timingSafeHexEqual`, so a capability detached onto a
 * DIFFERENT envelope (same nonce, drifted stored hash) is rejected without an
 * early-exit oracle. Returns `false` — never throws — on any mismatch (§D #6).
 */
export function reconcileBurnedCapability(
  capability: Capability,
  envelope: IntentEnvelope,
): boolean {
  // The presented envelope must re-derive to its own stored intentHash
  // (untampered) AND that hash must match the capability's bound intentHash.
  return (
    reconcileNonceHash(envelope, capability.intentHash) &&
    timingSafeHexEqual(capability.intentHash, envelope.intentHash)
  );
}
