/**
 * parkDeferredIntent — quota-enforced parking with counter increment/decrement.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parkDeferredIntent,
  decrementDeferCounter,
  deferCounterKey,
  deferParkKey,
  DEFAULT_DEFER_QUOTA_PER_SESSION,
  type ParkRedis,
} from "../src/defer-park.js";
import {
  setMetricsSink,
  _resetMetricsSink,
  type MetricsSink,
} from "@adjudicate/core";

function makeFakeRedis(): ParkRedis & {
  store: Map<string, string>;
  counters: Map<string, number>;
} {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  return {
    store,
    counters,
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
    async expire() {
      return 1;
    },
    async set(key, value) {
      store.set(key, value);
      return "OK";
    },
  };
}

const baseEnvelope = {
  intentHash: "deadbeef",
  kind: "thing.do",
  actor: { sessionId: "s-1" },
  payload: { x: 1 },
};

describe("deferCounterKey / deferParkKey", () => {
  it("produce stable, session-scoped suffixes", () => {
    expect(deferCounterKey("s-1")).toBe("defer:count:s-1");
    expect(deferParkKey("s-1")).toBe("defer:pending:s-1");
  });
});

describe("parkDeferredIntent", () => {
  afterEach(() => _resetMetricsSink());

  it("parks the envelope and increments the counter on success", async () => {
    const redis = makeFakeRedis();
    const result = await parkDeferredIntent({
      envelope: baseEnvelope,
      signal: "payment.confirmed",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
    });
    expect(result.parked).toBe(true);
    if (result.parked) {
      expect(result.count).toBe(1);
    }
    expect(redis.counters.get("defer:count:s-1")).toBe(1);
    expect(redis.store.has("defer:pending:s-1")).toBe(true);
  });

  it("supports many parks under the quota", async () => {
    const redis = makeFakeRedis();
    for (let i = 0; i < 5; i++) {
      const result = await parkDeferredIntent({
        envelope: { ...baseEnvelope, intentHash: `h-${i}` },
        signal: "x.signal",
        ttlSeconds: 3600,
        redis,
        rk: (k) => k,
        quotaPerSession: 5,
      });
      expect(result.parked).toBe(true);
    }
    expect(redis.counters.get("defer:count:s-1")).toBe(5);
  });

  it("refuses with quota_exceeded when the cap is exceeded", async () => {
    const redis = makeFakeRedis();
    for (let i = 0; i < 2; i++) {
      await parkDeferredIntent({
        envelope: { ...baseEnvelope, intentHash: `h-${i}` },
        signal: "x.signal",
        ttlSeconds: 3600,
        redis,
        rk: (k) => k,
        quotaPerSession: 2,
      });
    }
    const result = await parkDeferredIntent({
      envelope: { ...baseEnvelope, intentHash: "third" },
      signal: "x.signal",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
      quotaPerSession: 2,
    });
    expect(result.parked).toBe(false);
    if (result.parked === false) {
      expect(result.reason).toBe("quota_exceeded");
      expect(result.observed).toBe(3);
      expect(result.limit).toBe(2);
    }
  });

  it("rolls back the counter when quota is exceeded (next call sees correct count)", async () => {
    const redis = makeFakeRedis();
    await parkDeferredIntent({
      envelope: baseEnvelope,
      signal: "x.signal",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
      quotaPerSession: 1,
    });
    expect(redis.counters.get("defer:count:s-1")).toBe(1);

    // This call exceeds quota — counter should be rolled back to 1 after.
    await parkDeferredIntent({
      envelope: { ...baseEnvelope, intentHash: "second" },
      signal: "x.signal",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
      quotaPerSession: 1,
    });
    expect(redis.counters.get("defer:count:s-1")).toBe(1);
  });

  it("emits recordResourceLimit on quota exhaustion", async () => {
    const recorded: Array<{ resource: string; subject: string; limit: number; observed: number }> = [];
    const sink: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {},
      recordShadowDivergence() {},
      recordResourceLimit(event) {
        recorded.push({
          resource: event.resource,
          subject: event.subject,
          limit: event.limit,
          observed: event.observed,
        });
      },
    };
    setMetricsSink(sink);

    const redis = makeFakeRedis();
    await parkDeferredIntent({
      envelope: baseEnvelope,
      signal: "x.signal",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
      quotaPerSession: 0,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.resource).toBe("defer_quota");
    expect(recorded[0]!.subject).toBe("s-1");
    expect(recorded[0]!.limit).toBe(0);
  });

  it("uses DEFAULT_DEFER_QUOTA_PER_SESSION when no quota is supplied", async () => {
    const redis = makeFakeRedis();
    // Park up to the default quota — none should fail.
    for (let i = 0; i < DEFAULT_DEFER_QUOTA_PER_SESSION; i++) {
      const result = await parkDeferredIntent({
        envelope: { ...baseEnvelope, intentHash: `h-${i}` },
        signal: "x.signal",
        ttlSeconds: 3600,
        redis,
        rk: (k) => k,
      });
      expect(result.parked).toBe(true);
    }
    // One more should fail.
    const overflow = await parkDeferredIntent({
      envelope: { ...baseEnvelope, intentHash: "overflow" },
      signal: "x.signal",
      ttlSeconds: 3600,
      redis,
      rk: (k) => k,
    });
    expect(overflow.parked).toBe(false);
  });
});

describe("decrementDeferCounter", () => {
  it("DECRs the counter for a session", async () => {
    const redis = makeFakeRedis();
    redis.counters.set("defer:count:s-1", 5);
    await decrementDeferCounter(redis, (k) => k, "s-1");
    expect(redis.counters.get("defer:count:s-1")).toBe(4);
  });

  it("swallows redis errors (TTL is the safety net)", async () => {
    const decr = vi.fn(async () => {
      throw new Error("redis unavailable");
    });
    await expect(
      decrementDeferCounter({ decr }, (k) => k, "s-1"),
    ).resolves.toBeUndefined();
  });
});
