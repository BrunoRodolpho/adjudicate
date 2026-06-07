import { describe, expect, it } from "vitest";
import { createDriftDetector } from "../src/index.js";
import { rec } from "./helpers.js";

describe("drift bounded cardinality", () => {
  it("caps baseline categories and routes overflow to __overflow__", () => {
    const max = 8;
    const d = createDriftDetector({
      baselineWindow: 1000,
      alertThreshold: 0.5,
      dimensions: ["intent.kind"],
      maxCategoriesPerDimension: max,
    });
    for (let i = 0; i < max + 20; i += 1) d.observe(rec("EXECUTE", `kind-${i}`));
    const baseline = d.snapshot().dimensions[0]!.baseline;
    // At most `max` distinct keys plus the overflow bucket.
    expect(Object.keys(baseline).length).toBeLessThanOrEqual(max + 1);
    expect(baseline.__overflow__).toBeGreaterThan(0);
  });
});
