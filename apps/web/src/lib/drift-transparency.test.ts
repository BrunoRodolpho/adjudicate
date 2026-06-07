import { describe, expect, it } from "vitest";
import { projectDriftTransparency } from "./drift-transparency";
import {
  DRIFT_TRANSPARENCY_SAMPLE,
  type DriftTransparencySample,
} from "./transparency-fixtures";

/**
 * The public behavioral-drift projection is AGGREGATE-ONLY + BANDED (ADR-132).
 * These tests pin the load-bearing safety property: no category map, raw TVD,
 * baseline/recent count, overflow bucket, or timeline entry can cross the public
 * boundary — only a coarse band + an alert count + the top dimension NAME + asOf.
 */

const ALLOWED_KEYS = new Set([
  "severity",
  "activeAlerts",
  "topDimension",
  "asOf",
]);

const AS_OF = "2026-06-07T00:00:00.000Z";

describe("projectDriftTransparency — banded aggregate", () => {
  it("bands the worst dimension and counts active alerts", () => {
    const out = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    // decision.kind tvd 0.31 / threshold 0.25 => ratio 1.24 => elevated.
    expect(out.severity).toBe("elevated");
    expect(out.activeAlerts).toBe(1);
    expect(out.topDimension).toBe("decision.kind");
    expect(out.asOf).toBe(AS_OF);
  });

  it("reports ok / no top dimension when nothing is drifting", () => {
    const calm: DriftTransparencySample = {
      alertThreshold: 0.25,
      dimensions: [
        { dimension: "decision.kind", tvd: 0.05, alertCount: 0 },
        { dimension: "intent.kind", tvd: 0.01, alertCount: 0 },
      ],
    };
    const out = projectDriftTransparency(calm, AS_OF);
    expect(out.severity).toBe("ok");
    expect(out.activeAlerts).toBe(0);
    expect(out.topDimension).toBeNull();
  });

  it("escalates to high when a dimension is >= 2x threshold", () => {
    const hot: DriftTransparencySample = {
      alertThreshold: 0.25,
      dimensions: [
        { dimension: "decision.kind", tvd: 0.3, alertCount: 1 },
        { dimension: "intent.kind", tvd: 0.9, alertCount: 2 },
      ],
    };
    const out = projectDriftTransparency(hot, AS_OF);
    expect(out.severity).toBe("high");
    expect(out.activeAlerts).toBe(3);
    // Top = highest TVD that is drifting.
    expect(out.topDimension).toBe("intent.kind");
  });

  it("treats a degenerate (zero) threshold as drifting on any positive TVD", () => {
    const out = projectDriftTransparency(
      {
        alertThreshold: 0,
        dimensions: [{ dimension: "basis", tvd: 0.01, alertCount: 1 }],
      },
      AS_OF,
    );
    expect(out.severity).toBe("high");
    expect(out.topDimension).toBe("basis");
  });

  it("is deterministic over (sample, asOf)", () => {
    const a = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    const b = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    expect(a).toEqual(b);
  });
});

describe("projectDriftTransparency — no sensitive leak", () => {
  it("emits only allowlisted aggregate keys", () => {
    const out = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    for (const key of Object.keys(out)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });

  it("never emits a raw TVD number from the sample", () => {
    const out = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    const json = JSON.stringify(out);
    // The fixture's TVD values must not appear verbatim in the public output.
    for (const forbidden of ["0.31", "0.12", "0.04"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("drops any injected category map / baseline / recent / overflow / timeline", () => {
    const tampered = {
      ...DRIFT_TRANSPARENCY_SAMPLE,
      baseline: { EXECUTE: 41, REFUSE: 9 },
      recent: { REFUSE: 33, __overflow__: 4 },
      categories: ["injected.intent.kind", "secret-counterparty-doc"],
      entries: [{ at: AS_OF, maxTvd: 0.99 }],
    } as unknown as DriftTransparencySample;

    const out = projectDriftTransparency(tampered, AS_OF);
    const json = JSON.stringify(out);

    for (const forbidden of [
      "EXECUTE",
      "__overflow__",
      "injected.intent.kind",
      "secret-counterparty-doc",
      "0.99",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const forbiddenKey of [
      "baseline",
      "recent",
      "categories",
      "entries",
      "dimensions",
      "alertThreshold",
      "tvd",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(out, forbiddenKey)).toBe(false);
    }
  });

  it("publishes only a dimension NAME, never a category value", () => {
    const out = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
    // The top dimension is a closed public-vocabulary name.
    expect(["decision.kind", "intent.kind", "basis", null]).toContain(
      out.topDimension,
    );
  });
});
