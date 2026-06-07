import { describe, expect, it } from "vitest";
import { assertPackConformance, type PackV0 } from "@adjudicate/core";
import { incidentResponsePack } from "../src/index.js";

describe("pack-incident-response — conformance", () => {
  it("satisfies PackV0 and passes assertPackConformance", () => {
    const _typecheck: PackV0 = incidentResponsePack;
    void _typecheck;
    expect(() => assertPackConformance(incidentResponsePack)).not.toThrow();
  });

  it("default polarity is REFUSE (fail-closed)", () => {
    expect(incidentResponsePack.policy.default).toBe("REFUSE");
  });

  it("monitor callback is system-only (TRUSTED); others tolerate UNTRUSTED", () => {
    const taint = incidentResponsePack.policy.taint;
    expect(taint.minimumFor("incident.monitor.callback")).toBe("TRUSTED");
    expect(taint.minimumFor("incident.remediation.execute")).toBe("UNTRUSTED");
  });

  it("planner never exposes the system-only callback", () => {
    const plan = incidentResponsePack.planner.plan(
      { incidents: new Map([["i", { id: "i", severity: "sev2", status: "open", dependencies: [], createdAt: "x" }]]) },
      { operatorId: "o", oncallTeam: "t" },
    );
    expect(plan.allowedIntents).not.toContain("incident.monitor.callback");
  });
});
