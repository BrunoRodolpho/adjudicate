import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import type { AuditRecord } from "@adjudicate/core";
import {
  clampRiskBucket,
  createSessionRiskDriftBridge,
  quantizeRisk,
  riskBucketRank,
  type RiskBucket,
} from "../src/index.js";

/** Minimal AuditRecord carrying an optional metadata.hallucination_score. */
function scored(score: number | undefined, kind = "x.kind"): AuditRecord {
  return {
    version: 5,
    intentHash: "0x",
    envelope: { kind } as AuditRecord["envelope"],
    decision: { kind: "EXECUTE" } as AuditRecord["decision"],
    decision_basis: [],
    at: "2026-06-17T00:00:00.000Z",
    durationMs: 1,
    ...(score !== undefined ? { metadata: { hallucination_score: score } } : {}),
  } as AuditRecord;
}

describe("quantizeRisk", () => {
  it("buckets on the default 0.34 / 0.67 boundaries and clamps out-of-range", () => {
    expect(quantizeRisk(0)).toBe("low");
    expect(quantizeRisk(0.33)).toBe("low");
    expect(quantizeRisk(0.34)).toBe("medium");
    expect(quantizeRisk(0.66)).toBe("medium");
    expect(quantizeRisk(0.67)).toBe("high");
    expect(quantizeRisk(1)).toBe("high");
    expect(quantizeRisk(5)).toBe("high"); // clamp high
    expect(quantizeRisk(-2)).toBe("low"); // clamp low
  });

  it("honors custom thresholds incl. the opt-in critical bucket", () => {
    expect(quantizeRisk(0.95, { critical: 0.9 })).toBe("critical");
    expect(quantizeRisk(0.89, { critical: 0.9 })).toBe("high");
    expect(quantizeRisk(0.5, { medium: 0.4, high: 0.8 })).toBe("medium");
  });
});

describe("createSessionRiskDriftBridge", () => {
  it("feeds risk buckets into the parallel detector (baseline vs recent)", () => {
    const bridge = createSessionRiskDriftBridge({ baselineWindow: 4, alertThreshold: 0.25 });
    [0.1, 0.2, 0.1, 0.05].forEach((s) => bridge.observe(scored(s))); // baseline: 4 low
    [0.8, 0.9, 0.7, 0.75].forEach((s) => bridge.observe(scored(s))); // recent: 4 high
    const snap = bridge.snapshot();
    expect(snap.channel).toBe("session.risk");
    expect(snap.baseline).toEqual({ low: 4 });
    expect(snap.recent).toEqual({ high: 4 });
    expect(snap.tvd).toBe(1);
    expect(snap.totalObserved).toBe(8);
  });

  it("fires on a risk-distribution shift, all alerts on the session.risk channel", () => {
    const onDrift = vi.fn();
    const bridge = createSessionRiskDriftBridge({
      baselineWindow: 4,
      alertThreshold: 0.25,
      onDrift,
    });
    [0.1, 0.2, 0.1, 0.05].forEach((s) => bridge.observe(scored(s)));
    [0.8, 0.9, 0.7, 0.75].forEach((s) => bridge.observe(scored(s)));
    const alerts = bridge.evaluate();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.channel === "session.risk")).toBe(true);
    const signals = new Set(alerts.map((a) => a.signal));
    expect(signals.has("distribution_shift")).toBe(true);
    expect(signals.has("new_category")).toBe(true);
    expect(alerts.some((a) => a.category === "high")).toBe(true);
    expect(onDrift).toHaveBeenCalled();
  });

  it("captures the trend in history, deterministically (caller-supplied at)", () => {
    const bridge = createSessionRiskDriftBridge({
      baselineWindow: 3,
      recentWindow: 3,
      alertThreshold: 0.25,
    });
    [0.1, 0.1, 0.1].forEach((s) => bridge.observe(scored(s))); // freeze baseline {low:3}
    [0.1, 0.1, 0.1].forEach((s) => bridge.observe(scored(s))); // recent {low:3} → tvd 0
    bridge.recordHistory("2026-06-17T00:00:00.000Z");
    [0.9, 0.9, 0.9].forEach((s) => bridge.observe(scored(s))); // recent {high:3} → tvd 1
    bridge.recordHistory("2026-06-17T01:00:00.000Z");
    const view = bridge.historyView();
    expect(view.count).toBe(2);
    expect(view.entries[0]!.tvd).toBe(0);
    expect(view.entries[1]!.tvd).toBe(1);
    expect(view.entries.map((e) => e.at)).toEqual([
      "2026-06-17T00:00:00.000Z",
      "2026-06-17T01:00:00.000Z",
    ]);
  });

  it("uses riskScoreFn as the primary path and falls back to metadata.hallucination_score", () => {
    const bridge = createSessionRiskDriftBridge({
      baselineWindow: 1,
      alertThreshold: 0.5,
      // riskScoreFn supplies a score only for high.kind; undefined otherwise.
      riskScoreFn: (r) => (r.envelope?.kind === "high.kind" ? 0.9 : undefined),
    });
    // primary riskScoreFn → 0.9 → high (metadata 0.0 ignored)
    bridge.observe(scored(0.0, "high.kind"));
    expect(bridge.snapshot().baseline).toEqual({ high: 1 });
    // riskScoreFn returns undefined → fall back to metadata 0.1 → low
    bridge.observe(scored(0.1, "other"));
    expect(bridge.snapshot().recent).toEqual({ low: 1 });
  });

  it("skips no-signal records entirely (totalObserved counts scored samples only)", () => {
    const bridge = createSessionRiskDriftBridge({ baselineWindow: 2, alertThreshold: 0.5 });
    bridge.observe(scored(undefined)); // no riskScoreFn, no metadata → skipped
    bridge.observe(scored(undefined));
    expect(bridge.snapshot().totalObserved).toBe(0);
    bridge.observe(scored(0.1));
    expect(bridge.snapshot().totalObserved).toBe(1);
  });

  it("attaches to an AuditEventBus-shaped subscriber", () => {
    const handlers: Array<(r: AuditRecord) => void> = [];
    const bus = {
      subscribe(h: (r: AuditRecord) => void) {
        handlers.push(h);
        return () => {};
      },
    };
    const bridge = createSessionRiskDriftBridge({ baselineWindow: 1, alertThreshold: 0.5 });
    const unsub = bridge.attach(bus);
    handlers[0]!(scored(0.9));
    expect(bridge.snapshot().baseline).toEqual({ high: 1 });
    expect(typeof unsub).toBe("function");
  });

  it("is deterministic: same record sequence + same at → byte-identical reads", () => {
    const run = () => {
      const b = createSessionRiskDriftBridge({
        baselineWindow: 3,
        recentWindow: 3,
        alertThreshold: 0.25,
      });
      [0.1, 0.5, 0.9].forEach((s) => b.observe(scored(s)));
      [0.9, 0.9, 0.1].forEach((s) => b.observe(scored(s)));
      b.recordHistory("2026-06-17T00:00:00.000Z");
      return JSON.stringify({ snap: b.snapshot(), view: b.historyView() });
    };
    expect(run()).toBe(run());
  });
});

// ── 061/T5: never-decrease bucket contract (index §C / invariant #7) ──
// The risk-bucket scale is a non-deterministic, off-decision-path signal; §C's
// monotonicity law says a risk signal may only RAISE friction, never lower it.
// `clampRiskBucket` pins that on the local low→critical scale (no core→drift edge;
// observer-purity.test.ts stays green).
describe("061: RiskBucket never-decrease ceiling (clampRiskBucket)", () => {
  const BUCKETS: readonly RiskBucket[] = ["low", "medium", "high", "critical"];

  it("ranks the buckets low < medium < high < critical (contiguous 0..3, no gaps/ties)", () => {
    expect(BUCKETS.map(riskBucketRank)).toEqual([0, 1, 2, 3]);
    const byRank = [...BUCKETS].sort((a, b) => riskBucketRank(a) - riskBucketRank(b));
    expect(byRank).toEqual(BUCKETS);
  });

  it("a risk ceiling may only RAISE the bucket, never lower it", () => {
    expect(clampRiskBucket("low", "high")).toBe("high"); // raised
    expect(clampRiskBucket("high", "low")).toBe("high"); // NOT lowered
    expect(clampRiskBucket("medium", "critical")).toBe("critical"); // raised
    expect(clampRiskBucket("critical", "low")).toBe("critical"); // NOT lowered
    expect(clampRiskBucket("medium", "medium")).toBe("medium"); // idempotent
  });

  it("property: clampRiskBucket is a true never-decrease max over the bucket scale", () => {
    const bucketArb = fc.constantFrom<RiskBucket>(...BUCKETS);
    fc.assert(
      fc.property(bucketArb, bucketArb, (current, ceiling) => {
        const out = clampRiskBucket(current, ceiling);
        // Result is at least as risky as the current bucket (never decreases).
        expect(riskBucketRank(out)).toBeGreaterThanOrEqual(riskBucketRank(current));
        // Result is the HIGHER of the two (a genuine max over the scale).
        expect(riskBucketRank(out)).toBe(
          Math.max(riskBucketRank(current), riskBucketRank(ceiling)),
        );
      }),
      { numRuns: 1_000 },
    );
  });

  it("a never-decreasing observed sequence yields a monotonically non-decreasing running ceiling", () => {
    // Fold an arbitrary bucket sequence through the clamp: the running ceiling
    // never steps down, regardless of dips in the raw sequence.
    const seqArb = fc.array(fc.constantFrom<RiskBucket>(...BUCKETS), { minLength: 1, maxLength: 20 });
    fc.assert(
      fc.property(seqArb, (seq) => {
        let ceiling: RiskBucket = "low";
        let prevRank = -1;
        for (const b of seq) {
          ceiling = clampRiskBucket(ceiling, b);
          expect(riskBucketRank(ceiling)).toBeGreaterThanOrEqual(prevRank);
          prevRank = riskBucketRank(ceiling);
        }
        // Final ceiling equals the max bucket ever seen.
        const maxSeen = Math.max(...seq.map(riskBucketRank));
        expect(riskBucketRank(ceiling)).toBe(maxSeen);
      }),
      { numRuns: 500 },
    );
  });
});
