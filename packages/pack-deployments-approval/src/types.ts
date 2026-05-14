/**
 * @adjudicate/pack-deployments-approval — domain types.
 *
 * Real Pack #3 (after PIX and KYC). Exists to exercise the corners of the
 * Decision algebra that PIX and KYC under-emphasise: human approval gates
 * (ESCALATE) and destructive-action confirmation (REQUEST_CONFIRMATION).
 *
 * Three intent kinds:
 *
 *   - `deployment.approval.request` — UNTRUSTED. LLM or operator proposes a
 *     deploy. Staging EXECUTEs; production ESCALATEs unless an
 *     approval-resolve receipt is supplied.
 *
 *   - `deployment.rollback.execute` — UNTRUSTED. Destructive — the kernel
 *     REQUEST_CONFIRMATIONs before any rollback against production.
 *
 *   - `deployment.approval.resolve` — TRUSTED. Approver-side intent that
 *     records the human decision; the matching request can then EXECUTE.
 */

import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type DeploymentIntentKind =
  | "deployment.approval.request"
  | "deployment.rollback.execute"
  | "deployment.approval.resolve";

export type DeploymentEnvironment = "staging" | "production";

// ── Payloads ────────────────────────────────────────────────────────────

export interface DeploymentApprovalRequestPayload {
  readonly service: string;
  readonly gitSha: string;
  readonly environment: DeploymentEnvironment;
  /** Optional rollout ramp (1–100). REWRITE-clamped if outside the policy cap. */
  readonly rampPercent?: number;
}

export interface DeploymentRollbackExecutePayload {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  /** Git SHA to roll back to. */
  readonly toGitSha: string;
  /** Confirmation token from a prior REQUEST_CONFIRMATION on this exact intent. */
  readonly confirmationToken?: string;
}

export interface DeploymentApprovalResolvePayload {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly gitSha: string;
  readonly approver: string;
  /** Approver decision; "rejected" REFUSES the matching request. */
  readonly decision: "approved" | "rejected";
}

// ── State ───────────────────────────────────────────────────────────────

export interface DeploymentApproval {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly gitSha: string;
  readonly approver: string;
  readonly decision: "approved" | "rejected";
  readonly at: string;
}

export interface DeploymentState {
  /**
   * Approvals keyed by `${environment}/${service}/${gitSha}` — a deployment
   * request consults this to check whether the human gate has been cleared.
   */
  readonly approvals: ReadonlyMap<string, DeploymentApproval>;
}

// ── Context ─────────────────────────────────────────────────────────────

export interface DeploymentContext {
  /** Internal account requesting the deploy (e.g., "engineer@example.com"). */
  readonly requesterId: string;
}

// ── Taint policy ────────────────────────────────────────────────────────

/**
 * Resolve intents originate inside the approval system (operator console or
 * webhook from the issue tracker) — TRUSTED. Request and rollback come from
 * the LLM/operator boundary — UNTRUSTED.
 */
export const deploymentTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["deployment.approval.resolve"],
});

// ── Domain constants ────────────────────────────────────────────────────

/**
 * Maximum ramp percentage the kernel will let an `deployment.approval.request`
 * carry into production on a single shot. Anything above this REWRITEs to
 * `MAX_PRODUCTION_RAMP_PERCENT` so a typo can't push 100% of prod traffic
 * to a new build. Staging has no cap.
 */
export const MAX_PRODUCTION_RAMP_PERCENT = 25;

/** Build the state key for a (service, environment, gitSha) tuple. */
export function approvalKey(
  service: string,
  environment: DeploymentEnvironment,
  gitSha: string,
): string {
  return `${environment}/${service}/${gitSha}`;
}
