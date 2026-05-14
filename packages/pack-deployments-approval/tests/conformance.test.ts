import { describe, expect, it } from "vitest";
import { assertPackConformance } from "@adjudicate/core";
import { deploymentsApprovalPack } from "../src/index.js";

describe("pack-deployments-approval — conformance", () => {
  it("passes assertPackConformance", () => {
    expect(() => assertPackConformance(deploymentsApprovalPack)).not.toThrow();
  });

  it("declares all three intent kinds", () => {
    expect(deploymentsApprovalPack.intents).toEqual([
      "deployment.approval.request",
      "deployment.rollback.execute",
      "deployment.approval.resolve",
    ]);
  });

  it("uses PolicyBundle default=REFUSE (fail-closed)", () => {
    expect(deploymentsApprovalPack.policy.default).toBe("REFUSE");
  });
});
