import { describe, expect, it } from "vitest";
import { assertPackConformance } from "@adjudicate/core";
import { runConformance } from "@adjudicate/conformance";
import { {{className}}Pack } from "../src/index.js";

/**
 * Conformance test for the discover-generated Pack. The scaffold is
 * deny-by-default: it must pass both the boot-time structural check
 * (`assertPackConformance`) and the property suite (`runConformance`,
 * AC-001..AC-006). As you replace the generated REFUSE guards with real
 * logic, keep this test green.
 */
describe("{{packName}} — conformance", () => {
  it("passes boot-time pack conformance", () => {
    expect(() => assertPackConformance({{className}}Pack)).not.toThrow();
  });

  it("passes the runConformance property suite (AC-001..AC-006)", () => {
    const report = runConformance({{className}}Pack);
    expect(report.passed, JSON.stringify(report.results, null, 2)).toBe(true);
  });

  it("is deny-by-default (policy.default === REFUSE)", () => {
    expect({{className}}Pack.policy.default).toBe("REFUSE");
  });

  it("declares a non-empty basisCodes list", () => {
    expect({{className}}Pack.basisCodes.length).toBeGreaterThan(0);
  });
});
