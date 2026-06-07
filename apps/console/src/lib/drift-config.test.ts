import { describe, expect, it } from "vitest";
import { createDriftDetector } from "@adjudicate/drift";
import { DECISION_OUTCOME_MOCKS } from "./mocks";
import { DRIFT_CONFIG } from "./drift-config";

/**
 * Item 3 regression: with DRIFT_CONFIG's demo-sized windows, the reference
 * fixture stream actually drifts and evaluate() fires the onDrift alerting path
 * (previously dead: the 500-record baseline window meant 7 fixtures never
 * produced a recent window, so no alert could ever fire and evaluate() was
 * never called).
 */
describe("console drift wiring", () => {
  it("fires onDrift at least once for the demo fixture stream", () => {
    const alerts: unknown[] = [];
    const detector = createDriftDetector({
      ...DRIFT_CONFIG,
      onDrift: (a) => alerts.push(a),
    });
    for (const r of DECISION_OUTCOME_MOCKS) detector.observe(r);
    const returned = detector.evaluate();
    expect(returned.length).toBeGreaterThan(0);
    expect(alerts.length).toBe(returned.length); // onDrift fired once per crossing
  });

  it("the snapshot surfaces the same drift the panel reads", () => {
    const detector = createDriftDetector(DRIFT_CONFIG);
    for (const r of DECISION_OUTCOME_MOCKS) detector.observe(r);
    const snap = detector.snapshot();
    const totalAlerts = snap.dimensions.reduce((n, d) => n + d.alerts.length, 0);
    expect(totalAlerts).toBeGreaterThan(0);
  });
});
