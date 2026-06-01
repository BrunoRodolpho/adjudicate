import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("incr returns the new value; decr brings it back, clamping at zero", async () => {
    const store = createInMemoryDeferStore();
    expect(await store.incr("c")).toBe(1);
    expect(await store.incr("c")).toBe(2);
    expect(await store.decr("c")).toBe(1);
    // MemoryReviewer-002: decr to <= 0 clamps to 0 and evicts the counter key
    // (reference-count semantics) rather than going negative.
    expect(await store.decr("c")).toBe(0);
    expect(await store.decr("c")).toBe(0);
  });

  it("set with EX (no NX) writes unconditionally", async () => {
    const store = createInMemoryDeferStore();
    const result = await store.set("p", "envelope-blob", { EX: 60 });
    expect(result).toBe("OK");
    expect(await store.get("p")).toBe("envelope-blob");
  });
});

describe("createInMemoryDeferStore — MemoryReviewer-002", () => {
  it("expire() updates the TTL of an existing entry", async () => {
    const store = createInMemoryDeferStore();
    await store.set("k", "v", { EX: 1 }); // expires in 1s
    const result = await store.expire("k", 60); // refresh to 60s
    expect(result).toBe(1);
    // The refresh keeps the entry alive and readable.
    expect(await store.get("k")).toBe("v");
  });

  it("expire() actually extends the lifetime (entry survives past original TTL)", async () => {
    vi.useFakeTimers();
    try {
      const store = createInMemoryDeferStore();
      await store.set("k", "v", { EX: 1 }); // would expire at +1s
      await store.expire("k", 60); // refresh to +60s from now
      vi.advanceTimersByTime(5_000); // 5s — past the ORIGINAL 1s TTL
      expect(await store.get("k")).toBe("v"); // still alive thanks to refresh
    } finally {
      vi.useRealTimers();
    }
  });

  it("expire() returns 0 for a missing key", async () => {
    const store = createInMemoryDeferStore();
    const result = await store.expire("missing", 10);
    expect(result).toBe(0);
  });

  it("decr to zero deletes the counter key", async () => {
    const store = createInMemoryDeferStore();
    await store.incr("counter:session-1");
    const result = await store.decr("counter:session-1");
    expect(result).toBe(0);
    // Second decr returns 0 (key gone → starts from 0, decr → <= 0, deleted again).
    const result2 = await store.decr("counter:session-1");
    expect(result2).toBe(0);
  });

  it("expired store entries are swept on set", async () => {
    vi.useFakeTimers();
    try {
      const store = createInMemoryDeferStore();
      for (let i = 0; i < 10; i++) {
        await store.set(`k:${i}`, "v", { EX: 1 });
      }
      // Advance past the TTL so all entries are expired.
      vi.advanceTimersByTime(2_000);
      // Writing a new key triggers the opportunistic sweep.
      await store.set("k:new", "v", { EX: 60 });
      const old = await store.get("k:0");
      expect(old).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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

  // ── MemoryReviewer-005: expired-entry sweep on put ───────────────────────
  describe("expired-entry sweep", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sweeps expired entries on put without disturbing live ones", async () => {
      vi.useFakeTimers();
      const store = createInMemoryConfirmationStore();

      // A batch of short-lived tokens that nobody ever redeems.
      for (let i = 0; i < 5; i++) {
        await store.put(`stale-${i}`, pending, 10);
      }
      // A long-lived token that must survive the sweep.
      await store.put("live", pending, 10_000);

      // Advance past the short TTL so the stale tokens are expired, then put a
      // fresh token — this `put` triggers the opportunistic sweep.
      vi.advanceTimersByTime(20_000);
      await store.put("fresh", pending, 10_000);

      // Expired tokens are gone (swept proactively, not merely lazily on read).
      for (let i = 0; i < 5; i++) {
        expect(await store.take(`stale-${i}`)).toBeNull();
      }
      // The long-lived token (10_000s TTL from t0) is still alive at +20s and
      // must not be collateral damage of the sweep.
      expect(await store.take("live")).toEqual(pending);
      // The freshly-put token is alive and redeemable.
      expect(await store.take("fresh")).toEqual(pending);
    });
  });
});
