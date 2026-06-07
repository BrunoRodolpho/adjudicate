import { describe, expect, it } from "vitest";
import { createDriftDetector } from "../src/index.js";
import { many } from "./helpers.js";

/**
 * Frozen input→output fixture (the AC-style analog for a non-pack package): a
 * known sequence with a REFUSE spike must produce a stable, expected alert set.
 */
describe("drift conformance fixture", () => {
  it("a baseline of EXECUTE followed by a REFUSE spike yields the expected alerts", () => {
    const d = createDriftDetector({
      baselineWindow: 10,
      recentWindow: 10,
      alertThreshold: 0.3,
      dimensions: ["decision.kind"],
    });
    many(10, "EXECUTE").forEach((r) => d.observe(r)); // baseline frozen
    many(10, "REFUSE").forEach((r) => d.observe(r)); // recent
    const alerts = d.evaluate();
    expect(alerts.map((a) => a.signal).sort()).toEqual([
      "distribution_shift",
      "new_category",
      "proportion_spike",
    ]);
    const shift = alerts.find((a) => a.signal === "distribution_shift")!;
    expect(shift.magnitude).toBe(1);
    expect(shift.baselineCount).toBe(10);
    expect(shift.recentCount).toBe(10);
  });
});
