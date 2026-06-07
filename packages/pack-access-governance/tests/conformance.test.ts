import { describe, expect, it } from "vitest";
import { assertPackConformance, type PackV0 } from "@adjudicate/core";
import { accessGovernancePack } from "../src/index.js";

describe("pack-access-governance — conformance", () => {
  it("satisfies PackV0 and passes assertPackConformance", () => {
    const _t: PackV0 = accessGovernancePack;
    void _t;
    expect(() => assertPackConformance(accessGovernancePack)).not.toThrow();
  });

  it("default polarity is REFUSE", () => {
    expect(accessGovernancePack.policy.default).toBe("REFUSE");
  });

  it("review.resolve is TRUSTED-only; request tolerates UNTRUSTED", () => {
    const taint = accessGovernancePack.policy.taint;
    expect(taint.minimumFor("access.review.resolve")).toBe("TRUSTED");
    expect(taint.minimumFor("access.request")).toBe("UNTRUSTED");
  });

  it("planner never exposes access.review.resolve", () => {
    const plan = accessGovernancePack.planner.plan(
      { reviews: new Map(), grants: new Map([["k", { principal: "a", resourceId: "db.prod", privilegeLevel: 1 }]]) },
      { requesterId: "r" },
    );
    expect(plan.allowedIntents).not.toContain("access.review.resolve");
    expect(plan.allowedIntents).toContain("access.revoke");
  });
});
