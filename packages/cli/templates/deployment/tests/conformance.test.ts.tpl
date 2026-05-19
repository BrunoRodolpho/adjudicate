import { describe, expect, it } from "vitest";
import { assertPackConformance } from "@adjudicate/core";
import { {{className}}Pack } from "../src/index.js";

describe("{{packName}} — conformance", () => {
  it("passes kernel pack conformance", () => {
    expect(() => assertPackConformance({{className}}Pack)).not.toThrow();
  });

  it("declares the expected deployment intent kinds", () => {
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.deployment.request",
    );
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.deployment.rollback",
    );
  });

  it("uses contract v0", () => {
    expect({{className}}Pack.contract).toBe("v0");
  });

  it("declares basisCodes that the policy may emit", () => {
    expect({{className}}Pack.basisCodes.length).toBeGreaterThan(0);
  });

  it("has a non-empty business guard list", () => {
    expect({{className}}Pack.policy.business.length).toBeGreaterThan(0);
  });
});
