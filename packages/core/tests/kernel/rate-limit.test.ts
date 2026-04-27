/**
 * Rate-limit primitives — store + helper + guard composition.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionEscalate,
  type Decision,
} from "../../src/index.js";
import {
  checkRateLimit,
  createInMemoryRateLimitStore,
  createRateLimitGuard,
} from "../../src/kernel/rate-limit.js";

describe("createInMemoryRateLimitStore", () => {
  it("starts at 1 and increments per call within a window", async () => {
    const store = createInMemoryRateLimitStore();
    expect(await store.incrementAndGet("k", 1000)).toBe(1);
    expect(await store.incrementAndGet("k", 1000)).toBe(2);
    expect(await store.incrementAndGet("k", 1000)).toBe(3);
  });

  it("rolls over when the window elapses", async () => {
    let now = 1_000;
    const store = createInMemoryRateLimitStore(() => now);
    expect(await store.incrementAndGet("k", 1000)).toBe(1);
    expect(await store.incrementAndGet("k", 1000)).toBe(2);
    now = 3_000; // > 1000 + windowMs
    expect(await store.incrementAndGet("k", 1000)).toBe(1);
  });

  it("scopes counters by key", async () => {
    const store = createInMemoryRateLimitStore();
    await store.incrementAndGet("a", 1000);
    await store.incrementAndGet("a", 1000);
    expect(await store.incrementAndGet("b", 1000)).toBe(1);
  });
});

describe("checkRateLimit", () => {
  it("returns exceeded=true when count > max", async () => {
    const store = createInMemoryRateLimitStore();
    await store.incrementAndGet("k", 1000); // 1
    await store.incrementAndGet("k", 1000); // 2
    const result = await checkRateLimit({
      store,
      key: "k",
      windowMs: 1000,
      max: 2,
    });
    expect(result.count).toBe(3);
    expect(result.exceeded).toBe(true);
  });

  it("returns exceeded=false up to and including the cap", async () => {
    const store = createInMemoryRateLimitStore();
    const r1 = await checkRateLimit({ store, key: "k", windowMs: 1000, max: 2 });
    expect(r1.exceeded).toBe(false); // count=1
    const r2 = await checkRateLimit({ store, key: "k", windowMs: 1000, max: 2 });
    expect(r2.exceeded).toBe(false); // count=2
    const r3 = await checkRateLimit({ store, key: "k", windowMs: 1000, max: 2 });
    expect(r3.exceeded).toBe(true); // count=3
  });
});

describe("createRateLimitGuard", () => {
  function envFixture() {
    return buildEnvelope({
      kind: "thing.do",
      payload: { id: "x" },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
    });
  }

  it("returns null when count <= max", () => {
    const guard = createRateLimitGuard<string, { id: string }, { count: number }>({
      resolveCount: (_, state) => state.count,
      max: 5,
    });
    expect(guard(envFixture(), { count: 1 })).toBe(null);
    expect(guard(envFixture(), { count: 5 })).toBe(null);
  });

  it("returns the default REFUSE Decision when count > max", () => {
    const guard = createRateLimitGuard<string, { id: string }, { count: number }>({
      resolveCount: (_, state) => state.count,
      max: 5,
    });
    const d = guard(envFixture(), { count: 6 });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");
    if (d!.kind !== "REFUSE") return;
    expect(d!.refusal.kind).toBe("BUSINESS_RULE");
    expect(d!.refusal.code).toBe("rate_limit_exceeded");
  });

  it("respects custom onExceeded", () => {
    const onExceeded = (count: number): Decision =>
      decisionEscalate("supervisor", `count=${count}`, [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, { count }),
      ]);
    const guard = createRateLimitGuard<string, { id: string }, { count: number }>({
      resolveCount: (_, state) => state.count,
      max: 3,
      onExceeded,
    });
    const d = guard(envFixture(), { count: 10 });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("ESCALATE");
  });

  it("returns null when resolveCount returns undefined", () => {
    const guard = createRateLimitGuard<string, { id: string }, { count?: number }>({
      resolveCount: (_, state) => state.count,
      max: 5,
    });
    expect(guard(envFixture(), {})).toBe(null);
  });

  it("composes with checkRateLimit via state", async () => {
    const store = createInMemoryRateLimitStore();
    const guard = createRateLimitGuard<
      string,
      { id: string },
      { rateLimit?: number }
    >({
      resolveCount: (_, state) => state.rateLimit,
      max: 2,
    });

    // First two requests pass.
    let r = await checkRateLimit({ store, key: "user-1", windowMs: 1000, max: 2 });
    expect(guard(envFixture(), { rateLimit: r.count })).toBe(null);
    r = await checkRateLimit({ store, key: "user-1", windowMs: 1000, max: 2 });
    expect(guard(envFixture(), { rateLimit: r.count })).toBe(null);

    // Third trips the guard.
    r = await checkRateLimit({ store, key: "user-1", windowMs: 1000, max: 2 });
    const d = guard(envFixture(), { rateLimit: r.count });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");
  });
});

describe("RateLimitResult.rollback (T5 #41)", () => {
  it("decrements the counter when called once", async () => {
    const store = createInMemoryRateLimitStore();
    const r1 = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    expect(r1.count).toBe(1);
    const r2 = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    expect(r2.count).toBe(2);
    await r2.rollback();
    // After rollback, the next checkRateLimit should see the stored count
    // back at 2 (rolled back from 2 → 1 → next check increments to 2).
    const r3 = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    expect(r3.count).toBe(2);
  });

  it("is idempotent — calling rollback twice has the effect of one call", async () => {
    const store = createInMemoryRateLimitStore();
    const r1 = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    expect(r1.count).toBe(1);
    await r1.rollback();
    await r1.rollback(); // second call is a no-op
    const r2 = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    expect(r2.count).toBe(1); // counter is back at 0 → increment to 1
  });

  it("is a no-op when the store does not implement decrement", async () => {
    // Custom store without decrement.
    const counts = new Map<string, number>();
    const store = {
      async incrementAndGet(key: string) {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return n;
      },
    };
    const r = await checkRateLimit({ store, key: "u", windowMs: 1000, max: 5 });
    await expect(r.rollback()).resolves.toBeUndefined();
    expect(counts.get("u")).toBe(1); // unchanged
  });
});
