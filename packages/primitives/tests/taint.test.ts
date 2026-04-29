import { describe, expect, it } from "vitest";
import { createSystemTaintPolicy } from "../src/index.js";

describe("createSystemTaintPolicy", () => {
  it("returns TRUSTED for system-only kinds and UNTRUSTED for others", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["kyc.vendor.callback", "pix.charge.confirm"],
    });
    expect(policy.minimumFor("kyc.vendor.callback")).toBe("TRUSTED");
    expect(policy.minimumFor("pix.charge.confirm")).toBe("TRUSTED");
    expect(policy.minimumFor("kyc.start")).toBe("UNTRUSTED");
    expect(policy.minimumFor("pix.charge.create")).toBe("UNTRUSTED");
    expect(policy.minimumFor("any.unknown.kind")).toBe("UNTRUSTED");
  });

  it("allowlist-empty defaults every kind to UNTRUSTED", () => {
    const policy = createSystemTaintPolicy({ systemOnlyKinds: [] });
    expect(policy.minimumFor("anything")).toBe("UNTRUSTED");
  });

  it("respects custom userMinimum", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      userMinimum: "TRUSTED",
    });
    expect(policy.minimumFor("sys.event")).toBe("TRUSTED");
    expect(policy.minimumFor("user.event")).toBe("TRUSTED");
  });

  it("respects custom systemMinimum (e.g., lowering for testing)", () => {
    const policy = createSystemTaintPolicy({
      systemOnlyKinds: ["sys.event"],
      systemMinimum: "UNTRUSTED",
    });
    expect(policy.minimumFor("sys.event")).toBe("UNTRUSTED");
  });
});
