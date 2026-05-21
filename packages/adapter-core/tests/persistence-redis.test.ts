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
import type { IntentEnvelope } from "@adjudicate/core";
import { createRedisConfirmationStore } from "../src/persistence-redis.js";
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
