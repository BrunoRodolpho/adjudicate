import { describe, expect, it } from "vitest";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  type PendingConfirmation,
} from "../src/persistence.js";
import type { IntentEnvelope } from "@adjudicate/core";

describe("createInMemoryDeferStore — DeferRedis surface", () => {
  it("set with NX returns OK on first write, null on collision", async () => {
    const store = createInMemoryDeferStore();
    const a = await store.set("k", "v1", { NX: true, EX: 60 });
    const b = await store.set("k", "v2", { NX: true, EX: 60 });
    expect(a).toBe("OK");
    expect(b).toBeNull();
    expect(await store.get("k")).toBe("v1");
  });

  it("set with EX expires the value", async () => {
    const store = createInMemoryDeferStore();
    await store.set("ek", "v", { NX: true, EX: 0 });
    // EX=0 → expiresAt = Date.now(); subsequent get sees expired entry.
    // Wait one event-loop tick to be defensive in case the comparison
    // uses strict `>`.
    await new Promise((r) => setTimeout(r, 1));
    expect(await store.get("ek")).toBeNull();
  });

  it("get returns null for unknown key", async () => {
    const store = createInMemoryDeferStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("del removes the key", async () => {
    const store = createInMemoryDeferStore();
    await store.set("k", "v", { NX: true, EX: 60 });
    expect(await store.del("k")).toBe(1);
    expect(await store.get("k")).toBeNull();
    expect(await store.del("k")).toBe(0);
  });
});

describe("createInMemoryDeferStore — ParkRedis surface", () => {
  it("incr returns the new value; decr brings it back", async () => {
    const store = createInMemoryDeferStore();
    expect(await store.incr("c")).toBe(1);
    expect(await store.incr("c")).toBe(2);
    expect(await store.decr("c")).toBe(1);
    expect(await store.decr("c")).toBe(0);
    expect(await store.decr("c")).toBe(-1); // negative is allowed by spec
  });

  it("set with EX (no NX) writes unconditionally", async () => {
    const store = createInMemoryDeferStore();
    const result = await store.set("p", "envelope-blob", { EX: 60 });
    expect(result).toBe("OK");
    expect(await store.get("p")).toBe("envelope-blob");
  });
});

describe("createInMemoryConfirmationStore", () => {
  const stubEnvelope: IntentEnvelope = {
    version: 2,
    kind: "test.kind",
    payload: {},
    createdAt: new Date().toISOString(),
    nonce: "n",
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    intentHash: "0".repeat(64),
  };
  const pending: PendingConfirmation = {
    envelope: stubEnvelope,
    sessionId: "s-1",
    assistantHistorySnapshot: [],
    toolUseId: "tu-1",
    prompt: "Confirm?",
  };

  it("put then take returns the pending entry once", async () => {
    const store = createInMemoryConfirmationStore();
    await store.put("token-1", pending, 60);
    const taken = await store.take("token-1");
    expect(taken).toEqual(pending);
  });

  it("second take of the same token returns null (idempotent yes-then-yes)", async () => {
    const store = createInMemoryConfirmationStore();
    await store.put("token-1", pending, 60);
    await store.take("token-1");
    expect(await store.take("token-1")).toBeNull();
  });

  it("take returns null after TTL expiry", async () => {
    const store = createInMemoryConfirmationStore();
    await store.put("token-expire", pending, 0);
    await new Promise((r) => setTimeout(r, 1));
    expect(await store.take("token-expire")).toBeNull();
  });

  it("take returns null for an unknown token", async () => {
    const store = createInMemoryConfirmationStore();
    expect(await store.take("nope")).toBeNull();
  });
});
