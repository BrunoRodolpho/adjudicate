import { describe, expect, it } from "vitest";
import { analyzePolicy } from "@adjudicate/analyze";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { DEPLOYMENT_POLICY_COHERENCE_PROBES } from "./policy-coherence-probes";

/**
 * Item 11 regression: with the SHIPPED probe set the Tier-3 analyzer must NOT
 * emit false `unreachable_intent` warnings for the deployments pack's reachable
 * mutating intents (`deployment.approval.request`, `deployment.rollback.execute`).
 * Probing only with `context:{}` previously produced exactly those false
 * positives because the planner gates intents on `context.requesterId`.
 */
describe("deployment policy-coherence probes", () => {
  const report = analyzePolicy({
    pack: deploymentsApprovalPack as never,
    plannerProbes: DEPLOYMENT_POLICY_COHERENCE_PROBES as never,
  });

  const unreachable = report.diagnostics.filter(
    (d) => (d.detail as { rule?: string } | undefined)?.rule === "unreachable_intent",
  );

  it("emits no false unreachable_intent warnings with the authenticated probes", () => {
    expect(unreachable).toEqual([]);
  });

  it("regression guard: probing ONLY with context:{} DOES produce false positives", () => {
    const bad = analyzePolicy({
      pack: deploymentsApprovalPack as never,
      plannerProbes: [{ label: "empty", state: { approvals: new Map() }, context: {} }] as never,
    });
    const badUnreachable = bad.diagnostics.filter(
      (d) => (d.detail as { rule?: string } | undefined)?.rule === "unreachable_intent",
    );
    expect(badUnreachable.length).toBeGreaterThan(0); // proves the fix is load-bearing
  });
});
