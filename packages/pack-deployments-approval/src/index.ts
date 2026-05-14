/**
 * @adjudicate/pack-deployments-approval — third real Pack.
 *
 * Lights up the corners of the Decision algebra that PIX and KYC don't
 * emphasise: **ESCALATE** (production deploy without prior human approval),
 * **REQUEST_CONFIRMATION** (destructive rollback), and a different shape of
 * **REWRITE** (clamp ramp%, not currency cap).
 *
 * Adoption pattern: greenfield. Adopters import `deploymentsApprovalPack`,
 * dispatch envelopes against `deploymentsApprovalPack.policy`. State is the
 * approvals ledger keyed by `(service, environment, gitSha)` — see
 * `approvalKey()` in `./types`.
 */

import type { PackV0 } from "@adjudicate/core";
import { deploymentCapabilityPlanner } from "./capabilities.js";
import { deploymentPolicyBundle } from "./policies.js";
import type {
  DeploymentApproval,
  DeploymentContext,
  DeploymentIntentKind,
  DeploymentState,
} from "./types.js";

export {
  approvalKey,
  deploymentTaintPolicy,
  MAX_PRODUCTION_RAMP_PERCENT,
  type DeploymentApproval,
  type DeploymentApprovalRequestPayload,
  type DeploymentApprovalResolvePayload,
  type DeploymentContext,
  type DeploymentEnvironment,
  type DeploymentIntentKind,
  type DeploymentRollbackExecutePayload,
  type DeploymentState,
} from "./types.js";

export {
  DEPLOYMENT_CI_GREEN_SIGNAL,
  DEPLOYMENT_DEFAULT_DEFER_TIMEOUT_MS,
  HIGH_RAMP_THRESHOLD,
  deploymentPolicyBundle,
} from "./policies.js";

export {
  DEPLOYMENT_TOOLS,
  deploymentCapabilityPlanner,
} from "./capabilities.js";

/**
 * Rehydrate `DeploymentState` from a JSON-serialisable shape. The runtime
 * `approvals` field is a `Map`, which doesn't survive `JSON.stringify`.
 * Idempotent on already-rehydrated input.
 */
export function rehydrateDeploymentState(raw: unknown): DeploymentState {
  if (typeof raw === "object" && raw !== null && "approvals" in raw) {
    const a = (raw as { approvals: unknown }).approvals;
    if (a instanceof Map) {
      return { approvals: a as ReadonlyMap<string, DeploymentApproval> };
    }
    if (typeof a === "object" && a !== null) {
      return {
        approvals: new Map(
          Object.entries(a as Record<string, DeploymentApproval>),
        ),
      };
    }
  }
  return { approvals: new Map() };
}

export const deploymentsApprovalPack = {
  id: "pack-deployments-approval",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: [
    "deployment.approval.request",
    "deployment.rollback.execute",
    "deployment.approval.resolve",
  ],
  policy: deploymentPolicyBundle,
  planner: deploymentCapabilityPlanner,
  basisCodes: [
    "deployment.environment_invalid",
    "deployment.git_sha_missing",
    "deployment.approval_rejected",
  ],
  rehydrateState: rehydrateDeploymentState,
} as const satisfies PackV0<
  DeploymentIntentKind,
  unknown,
  DeploymentState,
  DeploymentContext
>;
