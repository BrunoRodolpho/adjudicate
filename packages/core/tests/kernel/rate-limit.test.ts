/**
 * Rate-limit primitives — store + helper + guard composition.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionEscalate,
  decisionRefuse,
  refuse,
  type Decision,
} from "../../src/index.js";
import {
  checkRateLimit,
  createCumulativeVelocityGuard,
  createInMemoryRateLimitStore,
  createRateLimitGuard,
  type VelocityBreach,
} from "../../src/kernel/rate-limit.js";
import {
  aggregateSnapshotFromRecorded,
  recordAggregateSnapshot,
  type AggregateSnapshot,
} from "../../src/index.js";

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

// ── 051: multi-horizon cumulative/velocity guard ───────────────────────────
describe("createCumulativeVelocityGuard (051)", () => {
  function envFixture() {
    return buildEnvelope({
      kind: "payment.transfer",
      payload: { amount: 100 },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "n-test",
      createdAt: "2026-04-23T12:00:00.000Z",
    });
  }

  function snap(windows: Record<string, number>): AggregateSnapshot {
    return { windows, at: "2026-04-23T11:59:00.000Z" };
  }

  type S = { aggregate?: AggregateSnapshot };

  it("returns null when the projected count is under the cap (EXECUTE path)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
    });
    // committed 3 + increment 1 = 4 <= 5 → under limit.
    expect(guard(envFixture(), { aggregate: snap({ "acct|daily": 3 }) })).toBe(
      null,
    );
  });

  it("boundary: projected exactly AT the cap is allowed (count > max, cap allowed)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
    });
    // committed 4 + increment 1 = 5 == max → ALLOWED (strict greater-than).
    expect(guard(envFixture(), { aggregate: snap({ "acct|daily": 4 }) })).toBe(
      null,
    );
  });

  it("boundary: projected one OVER the cap fires (REFUSE)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
    });
    // committed 5 + increment 1 = 6 > 5 → over limit.
    const d = guard(envFixture(), { aggregate: snap({ "acct|daily": 5 }) });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");
    if (d!.kind !== "REFUSE") return;
    expect(d!.refusal.kind).toBe("BUSINESS_RULE");
    expect(d!.refusal.code).toBe("cumulative_limit_exceeded");
    // The basis carries the breach arithmetic for the audit row.
    const b = d!.basis.find((x) => x.category === "business");
    expect(b?.detail).toMatchObject({
      windowKey: "acct|daily",
      committed: 5,
      increment: 1,
      projected: 6,
      max: 5,
    });
  });

  it("never authorizes EXECUTE — under-limit returns null, it does not grant (§C)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
    });
    // The guard returns null (defer to the rest of the pipeline), NOT a
    // friction-decreasing EXECUTE.
    const d = guard(envFixture(), { aggregate: snap({ "acct|daily": 1 }) });
    expect(d).toBe(null);
  });

  it("multi-horizon: fires on the FIRST breaching window in declared order", () => {
    const breaches: VelocityBreach[] = [];
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [
        { windowKey: "acct|daily", max: 10 }, // 8+1=9 ok
        { windowKey: "acct|monthly", max: 50 }, // 50+1=51 > 50 BREACH
        { windowKey: "acct|yearly", max: 1000 }, // would also breach but second wins
      ],
      onExceeded: (breach) => {
        breaches.push(breach);
        return defaultRefuseFromBreach(breach);
      },
    });
    const d = guard(
      envFixture(),
      {
        aggregate: snap({
          "acct|daily": 8,
          "acct|monthly": 50,
          "acct|yearly": 1001,
        }),
      },
    );
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");
    // Declared-order precedence: monthly breaches before yearly is evaluated.
    expect(breaches).toHaveLength(1);
    expect(breaches[0]!.windowKey).toBe("acct|monthly");
  });

  it("treats an absent window key as committed 0", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 1 }],
    });
    // window not present → committed 0 + 1 = 1 == max → allowed.
    expect(guard(envFixture(), { aggregate: snap({}) })).toBe(null);
  });

  it("returns null when no snapshot is injected (skips the check)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 0 }],
    });
    expect(guard(envFixture(), {})).toBe(null);
  });

  it("honors a custom increment (velocity weight per decision)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 100 }],
      resolveIncrement: (env) => env.payload.amount, // 100
    });
    // committed 1 + increment 100 = 101 > 100 → breach.
    const d = guard(envFixture(), { aggregate: snap({ "acct|daily": 1 }) });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");
  });

  it("clamps a malformed (negative / non-finite) increment to 0 — never fabricates headroom", () => {
    const guardNeg = createCumulativeVelocityGuard<string, { amount: number }, S>(
      {
        resolveSnapshot: (_e, s) => s.aggregate,
        horizons: [{ windowKey: "acct|daily", max: 5 }],
        resolveIncrement: () => -100, // attempt to undercut the committed count
      },
    );
    // committed 5 + clamped-0 = 5 == max → allowed (the negative is clamped to
    // 0, so it can NOT pull a 6-over-limit account back under the cap).
    expect(
      guardNeg(envFixture(), { aggregate: snap({ "acct|daily": 5 }) }),
    ).toBe(null);
    // committed 6 with clamped-0 increment = 6 > 5 → still a breach.
    const d = guardNeg(envFixture(), { aggregate: snap({ "acct|daily": 6 }) });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("REFUSE");

    const guardNaN = createCumulativeVelocityGuard<string, { amount: number }, S>(
      {
        resolveSnapshot: (_e, s) => s.aggregate,
        horizons: [{ windowKey: "acct|daily", max: 5 }],
        resolveIncrement: () => Number.NaN,
      },
    );
    // NaN → clamped 0 → 5 + 0 = 5 == max → allowed.
    expect(
      guardNaN(envFixture(), { aggregate: snap({ "acct|daily": 5 }) }),
    ).toBe(null);
  });

  it("respects a custom onExceeded (ESCALATE) — still friction-RAISING", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
      onExceeded: (breach) =>
        decisionEscalate("supervisor", `over ${breach.windowKey}`, [
          basis("business", BASIS_CODES.business.RULE_VIOLATED, {
            projected: breach.projected,
          }),
        ]),
    });
    const d = guard(envFixture(), { aggregate: snap({ "acct|daily": 9 }) });
    expect(d).not.toBeNull();
    expect(d!.kind).toBe("ESCALATE");
  });

  it("is deterministic & pure — same snapshot ⇒ same decision (replayable)", () => {
    const guard = createCumulativeVelocityGuard<string, { amount: number }, S>({
      resolveSnapshot: (_e, s) => s.aggregate,
      horizons: [{ windowKey: "acct|daily", max: 5 }],
    });
    const env = envFixture();
    const snapshot = snap({ "acct|daily": 5 });
    const first = guard(env, { aggregate: snapshot });
    const second = guard(env, { aggregate: snapshot });
    expect(first).toEqual(second);
    expect(first!.kind).toBe("REFUSE");

    // Round-trip the snapshot through the 052 record/replay primitives (the
    // recorded content-address path) and re-run the guard — identical decision.
    const recorded = recordAggregateSnapshot(snapshot);
    const replayedSnapshot = aggregateSnapshotFromRecorded(recorded);
    const replayed = guard(env, { aggregate: replayedSnapshot });
    expect(replayed).toEqual(first);
  });
});

// Local REFUSE builder so the multi-horizon precedence test can record the
// breach detail without depending on the factory's internal default.
function defaultRefuseFromBreach(breach: VelocityBreach): Decision {
  return decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "cumulative_limit_exceeded",
      "over limit",
      `window=${breach.windowKey}`,
    ),
    [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        windowKey: breach.windowKey,
      }),
    ],
  );
}
