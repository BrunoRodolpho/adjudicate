import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  type AuditRecord,
} from "@adjudicate/core";

/**
 * Resumed-decision fixture for the Approval Center audit chain (ADR-136).
 *
 * This is the AuditRecord the kernel writes AFTER an operator approves the
 * `DEMO_RESOLVED_APPROVAL` confirmation: a re-adjudicated EXECUTE carrying a
 * `confirmation_resolved` supersession that back-links to the parked intent
 * (the predecessor). `approval.chain` joins the resolved registry projection to
 * THIS record by `intentHash` and walks `supersedes` to render the
 * request → resolved → resumed timeline. The token is the redeemed confirmation
 * token — its presence (never its value) surfaces in the chain.
 *
 * In production this record is emitted by `agent.confirm()` inside the adopter's
 * adapter process; the reference console seeds it so the chain panel renders
 * against honest data (the console's own resolve() does NOT write it — see the
 * route handler's display-only note).
 */
const parkedEnvelope = buildEnvelope({
  kind: "deployment.rollback.execute",
  payload: { target: "a1b2c3d4", environment: "production" },
  actor: { principal: "llm", sessionId: "sess-dep-03" },
  taint: "UNTRUSTED",
  nonce: "n-dep-rollback-parked",
  createdAt: "2026-06-06T12:00:00.000Z",
});

const resumedEnvelope = buildEnvelope({
  kind: "deployment.rollback.execute",
  payload: { target: "a1b2c3d4", environment: "production" },
  actor: { principal: "llm", sessionId: "sess-dep-03" },
  taint: "UNTRUSTED",
  nonce: "n-dep-rollback-resumed",
  createdAt: "2026-06-06T12:05:00.000Z",
});

export const deploymentRollbackResumed: AuditRecord = buildAuditRecord({
  envelope: resumedEnvelope,
  decision: decisionExecute([
    basis("confirmation", "received", { requires: "explicit_confirmation" }),
    basis("state", "transition_valid"),
  ]),
  durationMs: 9,
  at: "2026-06-06T12:05:00.026Z",
  plan: {
    visibleReadTools: ["list_deployments", "get_deployment"],
    allowedIntents: ["deployment.rollback.execute"],
  },
  supersedes: {
    predecessorIntentHash: parkedEnvelope.intentHash,
    predecessorAt: "2026-06-06T12:00:00.000Z",
    reason: "confirmation_resolved",
    token: "demo-resolved-token",
  },
});

/** The resumed decision's intentHash — the join key the resolved projection carries. */
export const DEPLOYMENT_ROLLBACK_RESUMED_HASH = deploymentRollbackResumed.intentHash;
/** The parked predecessor intentHash — the chain's `requested` step target. */
export const DEPLOYMENT_ROLLBACK_PARKED_HASH = parkedEnvelope.intentHash;
