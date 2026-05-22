import { describe, expect, it } from "vitest";
import {
  basis,
  decisionExecute,
  decisionRefuse,
  refuse,
} from "@adjudicate/core";
import {
  DEFAULT_DRIFT_THRESHOLDS,
  classifyReplayDrift,
  type ReplayDriftSample,
  type ReplayMismatch,
  type ReplayReport,
} from "../src/index.js";

function mismatch(intentHash: string): ReplayMismatch {
  return {
    intentHash,
    kind: "DECISION_KIND",
    expected: decisionExecute([basis("BUSINESS_RULE", "ok", "x")]),
    actual: decisionRefuse(refuse("BUSINESS_RULE", "code", "y"), [
      basis("BUSINESS_RULE", "code", "y"),
    ]),
  };
}

function report(matched: number, mismatches: number): ReplayReport {
  return {
    total: matched + mismatches,
    matched,
    mismatches: Array.from({ length: mismatches }, (_, i) => mismatch(`h${i}`)),
  };
}

function sample(label: string, matched: number, mismatches: number): ReplayDriftSample {
  return { label, report: report(matched, mismatches) };
}

describe("classifyReplayDrift", () => {
  it("reports insufficient_data when fewer than minSamples are provided", () => {
    const out = classifyReplayDrift([sample("a", 100, 0), sample("b", 100, 0)]);
    expect(out.classification).toBe("insufficient_data");
    expect(out.netDelta).toBe(0);
    expect(out.directionFlips).toBe(0);
    expect(out.headline).toContain("insufficient_data");
  });

  it("classifies stable when mismatch rate stays within the threshold band", () => {
    const out = classifyReplayDrift([
      sample("a", 100, 0),
      sample("b", 100, 0),
      sample("c", 100, 0),
    ]);
    expect(out.classification).toBe("stable");
    expect(out.netDelta).toBe(0);
  });

  it("classifies regressing when mismatch rate trends up beyond threshold", () => {
    const out = classifyReplayDrift([
      sample("a", 100, 0),
      sample("b", 100, 2),
      sample("c", 100, 5),
    ]);
    expect(out.classification).toBe("regressing");
    expect(out.netDelta).toBeGreaterThan(DEFAULT_DRIFT_THRESHOLDS.regressionRateDelta);
    expect(out.headline).toContain("regressing");
  });

  it("classifies improving when mismatch rate trends down beyond threshold", () => {
    const out = classifyReplayDrift([
      sample("a", 100, 5),
      sample("b", 100, 2),
      sample("c", 100, 0),
    ]);
    expect(out.classification).toBe("improving");
    expect(out.netDelta).toBeLessThan(-DEFAULT_DRIFT_THRESHOLDS.regressionRateDelta);
  });

  it("classifies flapping when directional flips exceed the threshold", () => {
    const out = classifyReplayDrift(
      [
        sample("a", 100, 0),
        sample("b", 100, 5),
        sample("c", 100, 0),
        sample("d", 100, 5),
        sample("e", 100, 0),
      ],
      { maxFlips: 2 },
    );
    expect(out.classification).toBe("flapping");
    expect(out.directionFlips).toBeGreaterThan(2);
  });

  it("emits points and deltas aligned to the input order", () => {
    const out = classifyReplayDrift([
      sample("a", 100, 0),
      sample("b", 98, 2),
      sample("c", 96, 4),
    ]);
    expect(out.points).toHaveLength(3);
    expect(out.deltas).toHaveLength(3);
    expect(out.deltas[0]).toBe(0);
    expect(out.deltas[1]).toBeCloseTo(0.02, 5);
    expect(out.deltas[2]).toBeCloseTo(0.02, 5);
    expect(out.points[0]!.mismatchRate).toBe(0);
    expect(out.points[1]!.mismatchRate).toBeCloseTo(0.02, 5);
  });

  it("handles zero-total samples without dividing by zero", () => {
    const out = classifyReplayDrift([
      sample("a", 0, 0),
      sample("b", 0, 0),
      sample("c", 0, 0),
    ]);
    expect(out.classification).toBe("stable");
    expect(out.points.every((p) => p.mismatchRate === 0)).toBe(true);
  });

  it("is deterministic across repeated invocations on identical input", () => {
    const series = [
      sample("a", 100, 0),
      sample("b", 100, 2),
      sample("c", 100, 5),
    ];
    const a = classifyReplayDrift(series);
    const b = classifyReplayDrift(series);
    expect(a).toEqual(b);
  });
});
