/**
 * Redis-backed `ConfirmationStore` — restart-durable pending confirmations.
 *
 * Tests cover:
 *   - Put + take roundtrip preserves envelope, sessionId, history, prompt
 *   - History serialization uses the configurable serializer
 *   - take() is single-use (idempotent yes-then-yes returns null)
 *   - Missing token returns null
 *   - Malformed wire payload returns null without throwing
 *   - Key namespacing is applied via keyFor
 *   - TTL is forwarded to Redis as `EX`
 */

import { describe, expect, it } from "vitest";
import {
  bindCapability,
  buildEnvelope,
  type Capability,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  BURN_CLAIM_AND_BURN_LUA,
  createRedisBurnStore,
  createRedisConfirmationStore,
  reconcileBurnedCapability,
} from "../src/persistence-redis.js";
import type { PendingConfirmation } from "../src/persistence.js";

interface Entry {
  readonly value: string;
  readonly expiresAt: number | null;
}

function fakeRedis() {
  const store = new Map<string, Entry>();
  const calls: Array<{ op: string; key: string; ttl?: number }> = [];
  return {
    store,
    calls,
    client: {
      async get(key: string) {
        calls.push({ op: "get", key });
        const e = store.get(key);
        if (e === undefined) return null;
        if (e.expiresAt !== null && e.expiresAt < Date.now()) {
          store.delete(key);
          return null;
        }
        return e.value;
      },
      async set(
        key: string,
        value: string,
        opts?: { NX?: boolean; EX?: number },
      ) {
        calls.push({ op: "set", key, ttl: opts?.EX });
        const expiresAt =
          opts?.EX !== undefined ? Date.now() + opts.EX * 1000 : null;
        store.set(key, { value, expiresAt });
        return "OK";
      },
      async del(key: string) {
        calls.push({ op: "del", key });
        return store.delete(key) ? 1 : 0;
      },
    },
  };
}

function envelopeOf(): IntentEnvelope {
  return {
    version: 2,
    kind: "test.intent",
    payload: { amount: 100 },
    createdAt: "2026-05-20T00:00:00.000Z",
    nonce: "nonce-1",
    actor: { principal: "user", sessionId: "s-1" },
    taint: "UNTRUSTED",
    intentHash: "deadbeef",
  };
}

function pendingOf(overrides: Partial<PendingConfirmation<string[]>> = {}): PendingConfirmation<string[]> {
  return {
    envelope: envelopeOf(),
    sessionId: "s-1",
    assistantHistorySnapshot: ["turn-1", "turn-2"],
    toolUseId: "tu-1",
    prompt: "Confirm transfer of 100?",
    ...overrides,
  };
}

describe("createRedisConfirmationStore", () => {
  it("put + take roundtrip preserves the full pending confirmation", async () => {
    const { client } = fakeRedis();
    const store = createRedisConfirmationStore<string[]>({ client });

    await store.put("tok-1", pendingOf(), 300);
    const taken = await store.take("tok-1");

    expect(taken).not.toBeNull();
    expect(taken!.envelope.intentHash).toBe("deadbeef");
    expect(taken!.sessionId).toBe("s-1");
    expect(taken!.assistantHistorySnapshot).toEqual(["turn-1", "turn-2"]);
    expect(taken!.toolUseId).toBe("tu-1");
    expect(taken!.prompt).toBe("Confirm transfer of 100?");
  });

  it("take() is single-use — second take returns null", async () => {
    const { client } = fakeRedis();
    const store = createRedisConfirmationStore<string[]>({ client });

    await store.put("tok-1", pendingOf(), 300);
    const first = await store.take("tok-1");
    const second = await store.take("tok-1");

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("missing token returns null without throwing", async () => {
    const { client } = fakeRedis();
    const store = createRedisConfirmationStore<string[]>({ client });

    const taken = await store.take("never-existed");
    expect(taken).toBeNull();
  });

  it("malformed wire payload returns null", async () => {
    const { client, store } = fakeRedis();
    store.set("confirm:tok-1", { value: "not-json", expiresAt: null });
    const confirmStore = createRedisConfirmationStore<string[]>({ client });
    const taken = await confirmStore.take("tok-1");
    expect(taken).toBeNull();
  });

  it("keyFor namespaces the key in Redis", async () => {
    const { client, calls } = fakeRedis();
    const store = createRedisConfirmationStore<string[]>({
      client,
      keyFor: (s) => `ENV:adjudicate:${s}`,
    });

    await store.put("tok-1", pendingOf(), 300);
    expect(calls.some((c) => c.key === "ENV:adjudicate:confirm:tok-1")).toBe(true);
  });

  it("TTL is forwarded to Redis as EX seconds", async () => {
    const { client, calls } = fakeRedis();
    const store = createRedisConfirmationStore<string[]>({ client });

    await store.put("tok-1", pendingOf(), 900);
    const setCall = calls.find((c) => c.op === "set");
    expect(setCall?.ttl).toBe(900);
  });

  it("custom history serializer is honored on both put and take", async () => {
    interface RichHistory {
      readonly entries: ReadonlyArray<{ readonly role: string; readonly text: string }>;
    }
    const { client } = fakeRedis();
    let serialized = 0;
    let deserialized = 0;
    const store = createRedisConfirmationStore<RichHistory>({
      client,
      serializeHistory: (h) => {
        serialized++;
        return JSON.stringify(h);
      },
      deserializeHistory: (s) => {
        deserialized++;
        return JSON.parse(s) as RichHistory;
      },
    });

    const history: RichHistory = {
      entries: [
        { role: "user", text: "send 100" },
        { role: "assistant", text: "Confirming..." },
      ],
    };

    await store.put("tok-1", {
      envelope: envelopeOf(),
      sessionId: "s-1",
      assistantHistorySnapshot: history,
      toolUseId: "tu-1",
      prompt: "Confirm?",
    }, 300);
    expect(serialized).toBe(1);

    const taken = await store.take("tok-1");
    expect(deserialized).toBe(1);
    expect(taken!.assistantHistorySnapshot).toEqual(history);
  });

  it("a Redis TTL expiry during take returns null", async () => {
    const { client, store } = fakeRedis();
    const confirmStore = createRedisConfirmationStore<string[]>({ client });

    // Put with an expired entry directly
    store.set("confirm:tok-1", {
      value: JSON.stringify({
        envelope: envelopeOf(),
        sessionId: "s-1",
        historyJson: JSON.stringify([]),
        toolUseId: "tu-1",
        prompt: "?",
      }),
      expiresAt: Date.now() - 1000,
    });

    const taken = await confirmStore.take("tok-1");
    expect(taken).toBeNull();
  });
});

// ─── createRedisBurnStore (single-use capability burn, 022 T2) ───────────────
//
// The fake Redis models the load-bearing property under test: Redis evaluates a
// Lua script ATOMICALLY (single-threaded, no command interleaving). `evalGetDel`
// reads + deletes SYNCHRONOUSLY (no `await` between them), so two concurrently
// dispatched burns cannot both observe the same value — exactly the at-most-once
// guarantee the Lua `EVAL` provides on a real server. `evalGetDelNonAtomic`
// models the BROKEN non-atomic GET-then-DEL (a `yield` between get and del) so
// the test can prove the atomicity assertion is non-vacuous (the race is real).

function fakeBurnRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  const calls: Array<{ op: string; key: string }> = [];
  const live = (k: string) => {
    const e = store.get(k);
    if (e === undefined) return null;
    if (e.expiresAt !== null && e.expiresAt < Date.now()) {
      store.delete(k);
      return null;
    }
    return e;
  };
  const client = {
    async set(key: string, value: string, opts?: { NX?: boolean; EX?: number }) {
      calls.push({ op: "set", key });
      if (opts?.NX && live(key) !== null) return null; // first-writer-wins
      store.set(key, {
        value,
        expiresAt: opts?.EX !== undefined ? Date.now() + opts.EX * 1000 : null,
      });
      return "OK";
    },
    // ATOMIC: read + delete in one synchronous step (models Lua EVAL).
    async evalGetDel(_script: string, key: string) {
      calls.push({ op: "eval", key });
      const e = live(key);
      if (e === null) return null;
      store.delete(key); // synchronous with the read — no interleaving window
      return e.value;
    },
    // BROKEN reference: non-atomic GET-then-DEL with a yield between them. Used
    // ONLY to prove the race the atomic path closes is genuinely present.
    async evalGetDelNonAtomic(_script: string, key: string) {
      const e = live(key);
      if (e === null) return null;
      await Promise.resolve(); // yield → the OTHER concurrent burn runs here
      store.delete(key);
      return e.value;
    },
  };
  return { store, calls, client };
}

const burnCapOf = (intentHash = "c".repeat(64)): Capability =>
  bindCapability({ intentHash, kernelId: "kernel://test" }, "test-key");

describe("createRedisBurnStore", () => {
  it("mint + burn redeems the bound capability exactly once", async () => {
    const { client } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    const cap = burnCapOf();

    expect(await store.mint("nonce-1", cap, 300)).toBe(true);
    expect(await store.burn("nonce-1")).toEqual(cap);
  });

  it("second burn returns null (single-use, idempotent yes-then-yes)", async () => {
    const { client } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    await store.mint("nonce-1", burnCapOf(), 300);

    expect(await store.burn("nonce-1")).not.toBeNull();
    expect(await store.burn("nonce-1")).toBeNull();
  });

  it("burn of an unknown nonce returns null (fail-closed miss)", async () => {
    const { client } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    expect(await store.burn("never-minted")).toBeNull();
  });

  it("burn past TTL returns null (Redis EX expiry fails closed)", async () => {
    const { client, store: backing } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    await store.mint("nonce-exp", burnCapOf(), 300);
    // Force the backing key past its TTL — Redis would have already evicted it.
    const entry = backing.get("burn:nonce-exp")!;
    backing.set("burn:nonce-exp", { value: entry.value, expiresAt: Date.now() - 1 });
    expect(await store.burn("nonce-exp")).toBeNull();
  });

  it("mint is first-writer-wins via SET NX (a second mint of a live nonce is suppressed)", async () => {
    const { client } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    const first = burnCapOf("a".repeat(64));
    const second = burnCapOf("b".repeat(64));

    expect(await store.mint("nonce-1", first, 300)).toBe(true);
    expect(await store.mint("nonce-1", second, 300)).toBe(false);
    expect(await store.burn("nonce-1")).toEqual(first);
  });

  it("burn uses the atomic Lua EVAL path, not a bare GET+DEL", async () => {
    const { client, calls } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    await store.mint("nonce-1", burnCapOf(), 300);
    await store.burn("nonce-1");
    // The burn must go through evalGetDel (the Lua claim-and-burn), never a
    // separate get/del — that separation is the double-spend race.
    expect(calls.some((c) => c.op === "eval" && c.key === "burn:nonce-1")).toBe(true);
    expect(calls.some((c) => c.op === "del")).toBe(false);
  });

  it("malformed stored blob → burn returns null without throwing (fail-closed)", async () => {
    const { client, store: backing } = fakeBurnRedis();
    const store = createRedisBurnStore<Capability>({ client });
    backing.set("burn:nonce-1", { value: "not-json", expiresAt: null });
    await expect(store.burn("nonce-1")).resolves.toBeNull();
  });

  it("concurrent burns of the same nonce do not double-spend (Lua EVAL atomicity)", async () => {
    // The race the production confirmation store's GET+DEL `take` cannot pin
    // (persistence-redis.ts): two concurrent burns of one nonce. The atomic Lua
    // EVAL yields the record AT MOST ONCE across both — never twice.
    const { client } = fakeBurnRedis();
    const store = createRedisBurnStore({ client });
    const cap = burnCapOf();
    await store.mint("nonce-race", cap, 300);

    const results = await Promise.all([
      store.burn("nonce-race"),
      store.burn("nonce-race"),
      store.burn("nonce-race"),
    ]);

    const wins = results.filter((r) => r !== null);
    expect(wins).toHaveLength(1); // exactly one — no double-spend
    expect(wins[0]).toEqual(cap);
  });

  it("a NON-atomic GET-then-DEL WOULD double-spend (proves the atomicity assertion is non-vacuous)", async () => {
    // Sanity check on the test harness: wire the burn through the BROKEN
    // non-atomic reference and show two concurrent burns BOTH win. This proves
    // the at-most-once result above is a property of the ATOMIC path, not an
    // artifact of the fake never being able to interleave.
    const { client, store: backing } = fakeBurnRedis();
    backing.set("burn:nonce-race", {
      value: JSON.stringify(burnCapOf()),
      expiresAt: null,
    });
    const racyBurn = async (nonce: string) => {
      const raw = await client.evalGetDelNonAtomic(
        BURN_CLAIM_AND_BURN_LUA,
        `burn:${nonce}`,
      );
      return raw === null ? null : (JSON.parse(raw) as Capability);
    };

    const results = await Promise.all([
      racyBurn("nonce-race"),
      racyBurn("nonce-race"),
    ]);
    const wins = results.filter((r) => r !== null);
    expect(wins).toHaveLength(2); // DOUBLE-SPEND — the bug the Lua EVAL closes
  });
});

// ─── reconcileBurnedCapability (nonce reconciliation, 022 T3) ────────────────

describe("reconcileBurnedCapability", () => {
  // A real v2 envelope so the nonce-bound intentHash is genuinely re-derived
  // through the kernel's canonical recipe (untouched), not a stub literal.
  const envOf = (nonce = "nonce-1") =>
    buildEnvelope({
      kind: "pix.charge.refund",
      payload: { amountCentavos: 1000 },
      actor: { principal: "user", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce,
    });

  it("matches when the capability is bound to the presented envelope's intentHash", () => {
    const env = envOf();
    const cap = burnCapOf(env.intentHash);
    expect(reconcileBurnedCapability(cap, env)).toBe(true);
  });

  it("rejects a mutated nonce (re-derived hash differs → false, never throws)", () => {
    const env = envOf("nonce-1");
    const cap = burnCapOf(env.intentHash);
    // The presented envelope carries a DIFFERENT nonce than the one the
    // capability was minted against → re-derivation diverges → fail-closed.
    const tampered = envOf("nonce-TAMPERED");
    expect(reconcileBurnedCapability(cap, tampered)).toBe(false);
  });

  it("rejects a capability bound to a different intentHash (detached grant)", () => {
    const env = envOf();
    const cap = burnCapOf("f".repeat(64)); // bound to some OTHER intent
    expect(reconcileBurnedCapability(cap, env)).toBe(false);
  });

  it("rejects an envelope whose stored intentHash was tampered (re-derive mismatch)", () => {
    const env = envOf();
    const cap = burnCapOf(env.intentHash);
    // Forge the envelope's stored hash to equal the cap's bound hash so the
    // belt-and-suspenders cap-vs-stored compare passes — but the re-derivation
    // no longer matches, so reconcileNonceHash fails closed.
    const forged = { ...env, intentHash: "0".repeat(64) } as IntentEnvelope;
    const forgedCap = burnCapOf("0".repeat(64));
    expect(reconcileBurnedCapability(forgedCap, forged)).toBe(false);
  });
});
