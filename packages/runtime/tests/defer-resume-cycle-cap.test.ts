/**
 * T5 (top-priority I) — per-`intentHash` resume cycle cap.
 *
 * A pending intent that resumes, re-adjudicates to DEFER, parks again,
 * resumes again, etc., is bounded only by the per-session concurrent-park
 * quota — not by total resume cycles. A misbehaving signal source could
 * oscillate within quota indefinitely. The cycle cap closes that path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resumeDeferredIntent,
  DEFAULT_MAX_RESUME_CYCLES,
  type DeferRedis,
} from "../src/defer-resume.js";

const rk = (s: string) => `ENV:${s}`;

const PARKED = JSON.stringify({
  envelope: {
    intentHash: "deadbeef",
    kind: "order.confirm",
    actor: { sessionId: "s-1" },
    payload: { orderId: "ord_1" },
  },
  signal: "payment.confirmed",
  parkedAt: "2026-04-23T12:00:00.000Z",
});

interface FakeRedis {
  readonly redis: DeferRedis;
  readonly state: {
    pending: Map<string, string>;
    resumed: Map<string, string>;
    cycle: Map<string, number>;
  };
}

function makeFakeRedis(seed: { pending?: Record<string, string> } = {}): FakeRedis {
  const pending = new Map(Object.entries(seed.pending ?? {}));
  const resumed = new Map<string, string>();
  const cycle = new Map<string, number>();
  const redis: DeferRedis = {
    async get(key) {
      return pending.get(key) ?? null;
    },
    async set(key, value, options) {
      if (options.NX && resumed.has(key)) return null;
      resumed.set(key, value);
      return "OK";
    },
    async del(key) {
      pending.delete(key);
      return 1;
    },
    async incr(key) {
      const v = (cycle.get(key) ?? 0) + 1;
      cycle.set(key, v);
      return v;
    },
    async expire() {
      return 1;
    },
  };
  return { redis, state: { pending, resumed, cycle } };
}

describe("resumeDeferredIntent — cycle cap (T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("default cap is 3 — fourth resume returns cycle_cap_exceeded", async () => {
    expect(DEFAULT_MAX_RESUME_CYCLES).toBe(3);
    const fake = makeFakeRedis({
      pending: { "ENV:defer:pending:s-1": PARKED },
    });
    // Cycle 1 — succeeds.
    const r1 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
    });
    expect(r1.resumed).toBe(true);
    // Re-park (simulate re-adjudication producing DEFER again).
    fake.state.pending.set("ENV:defer:pending:s-1", PARKED);
    fake.state.resumed.clear();
    // Cycle 2 — succeeds.
    const r2 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
    });
    expect(r2.resumed).toBe(true);
    // Re-park.
    fake.state.pending.set("ENV:defer:pending:s-1", PARKED);
    fake.state.resumed.clear();
    // Cycle 3 — succeeds (at the cap).
    const r3 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
    });
    expect(r3.resumed).toBe(true);
    // Re-park.
    fake.state.pending.set("ENV:defer:pending:s-1", PARKED);
    fake.state.resumed.clear();
    // Cycle 4 — exceeded.
    const r4 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
    });
    expect(r4.resumed).toBe(false);
    expect(r4.reason).toBe("cycle_cap_exceeded");
    expect(r4.intentHash).toBe("deadbeef");
  });

  it("respects a custom maxResumeCycles (e.g., 1)", async () => {
    const fake = makeFakeRedis({
      pending: { "ENV:defer:pending:s-1": PARKED },
    });
    const r1 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
      maxResumeCycles: 1,
    });
    expect(r1.resumed).toBe(true);
    fake.state.pending.set("ENV:defer:pending:s-1", PARKED);
    fake.state.resumed.clear();
    const r2 = await resumeDeferredIntent({
      sessionId: "s-1",
      signal: "payment.confirmed",
      redis: fake.redis,
      rk,
      maxResumeCycles: 1,
    });
    expect(r2.resumed).toBe(false);
    expect(r2.reason).toBe("cycle_cap_exceeded");
  });

  it("maxResumeCycles=0 disables the cap (back-compat)", async () => {
    const fake = makeFakeRedis({
      pending: { "ENV:defer:pending:s-1": PARKED },
    });
    for (let i = 0; i < 5; i++) {
      fake.state.pending.set("ENV:defer:pending:s-1", PARKED);
      fake.state.resumed.clear();
      const r = await resumeDeferredIntent({
        sessionId: "s-1",
        signal: "payment.confirmed",
        redis: fake.redis,
        rk,
        maxResumeCycles: 0,
      });
      expect(r.resumed).toBe(true);
    }
  });

  it("skips the cap when redis.incr is not available (back-compat)", async () => {
    // Build a redis without incr — back-compat case.
    const pending = new Map<string, string>();
    pending.set("ENV:defer:pending:s-1", PARKED);
    const resumed = new Map<string, string>();
    const redis: DeferRedis = {
      async get(key) {
        return pending.get(key) ?? null;
      },
      async set(key, value, options) {
        if (options.NX && resumed.has(key)) return null;
        resumed.set(key, value);
        return "OK";
      },
      async del(key) {
        pending.delete(key);
        return 1;
      },
    };
    // Without incr, the cap is skipped — even at 100 cycles, no failure.
    for (let i = 0; i < 5; i++) {
      pending.set("ENV:defer:pending:s-1", PARKED);
      resumed.clear();
      const r = await resumeDeferredIntent({
        sessionId: "s-1",
        signal: "payment.confirmed",
        redis,
        rk,
        maxResumeCycles: 1, // would block at cycle 2 if incr was wired
      });
      expect(r.resumed).toBe(true);
    }
  });
});
