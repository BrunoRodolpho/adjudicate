import { describe, expect, it } from "vitest";
import { assertPackConformance } from "@adjudicate/core";
import { {{className}}Pack } from "../src/index.js";

describe("{{packName}} — conformance", () => {
  it("passes kernel pack conformance", () => {
    expect(() => assertPackConformance({{className}}Pack)).not.toThrow();
  });

  it("declares the expected KYC intent kinds", () => {
    expect({{className}}Pack.intents).toContain("{{intentPrefix}}.kyc.start");
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.kyc.document.upload",
    );
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.kyc.vendor.callback",
    );
    expect({{className}}Pack.intents).toContain(
      "{{intentPrefix}}.kyc.complete",
    );
  });

  it("uses contract v0", () => {
    expect({{className}}Pack.contract).toBe("v0");
  });

  it("declares both KYC defer signals", () => {
    expect({{className}}Pack.signals).toContain("kyc.documents.uploaded");
    expect({{className}}Pack.signals).toContain("kyc.vendor.completed");
  });

  it("has a non-empty business guard list", () => {
    expect({{className}}Pack.policy.business.length).toBeGreaterThan(0);
  });
});
