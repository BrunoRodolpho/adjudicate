import { describe, expect, it } from "vitest";
import { assertPackConformance } from "@adjudicate/core";
import { {{className}}Pack } from "../src/index.js";

describe("{{packName}} — conformance", () => {
  it("passes kernel pack conformance", () => {
    expect(() => assertPackConformance({{className}}Pack)).not.toThrow();
  });

  it("declares the expected approval intent kinds", () => {
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.approval.request",
    );
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.approval.approve",
    );
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.approval.deny",
    );
  });

  it("uses contract v0", () => {
    expect({{className}}Pack.contract).toBe("v0");
  });

  it("declares the approval-granted defer signal", () => {
    expect({{className}}Pack.signals).toContain("approval.granted");
  });

  it("has a non-empty business guard list", () => {
    expect({{className}}Pack.policy.business.length).toBeGreaterThan(0);
  });
});
