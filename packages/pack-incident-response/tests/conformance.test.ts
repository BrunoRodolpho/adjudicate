import { describe, expect, it } from "vitest";
import { assertPackConformance, type PackV0 } from "@adjudicate/core";
import { incidentResponsePack } from "../src/index.js";
import {
  INCIDENT_BUDGET_CAPABLE_INTENTS,
  INCIDENT_INTENTS,
} from "../src/capabilities.js";

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

  // 025 — capabilities-as-budgets: the Pack declares which intent kinds a
  // standing, bounded budget may pre-authorize (the budget-capable class).
  it("INCIDENT_BUDGET_CAPABLE_INTENTS declares the LLM-proposable remediation (a non-empty subset of declared intents, excluding system-only/escalate kinds)", () => {
    expect(INCIDENT_BUDGET_CAPABLE_INTENTS.length).toBeGreaterThan(0);
    expect([...INCIDENT_BUDGET_CAPABLE_INTENTS]).toEqual([
      "incident.remediation.execute",
    ]);
    for (const k of INCIDENT_BUDGET_CAPABLE_INTENTS) {
      expect(INCIDENT_INTENTS).toContain(k);
    }
    // The system-only callback and the friction-only escalate are NOT budget-capable.
    const budgetable = INCIDENT_BUDGET_CAPABLE_INTENTS as readonly string[];
    expect(budgetable).not.toContain("incident.monitor.callback");
    expect(budgetable).not.toContain("incident.escalate");
  });
});
