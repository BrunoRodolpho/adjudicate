import { installPack } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import {
  deploymentsApprovalPack,
  rehydrateDeploymentState,
  type DeploymentApprovalRequestPayload,
} from "@adjudicate/pack-deployments-approval";
import type { ConsolePackAdapter } from "../adapter";

/**
 * Console adapter for `@adjudicate/pack-deployments-approval`.
 *
 * Synthetic state strategy: empty approvals map by default — the policy's
 * default behaviour is ESCALATE for production deploys, EXECUTE for
 * staging. For audit records where the original adjudication needed an
 * approval present (e.g., a recorded EXECUTE on a production deploy), the
 * replay reconstructs a plausible approval keyed off the envelope payload
 * so the kernel re-emits the same outcome. Records with no
 * `service`/`gitSha` (malformed/legacy) yield an empty approvals map.
 */

const { pack } = installPack(deploymentsApprovalPack);

export const deploymentsAdapter: ConsolePackAdapter = {
  pack,
  displayName: "Deployments Approval",
  async getSyntheticState(record: AuditRecord) {
    if (record.envelope.kind !== "deployment.approval.request") {
      return rehydrateDeploymentState({ approvals: {} });
    }
    const p = record.envelope.payload as Partial<DeploymentApprovalRequestPayload>;
    if (
      record.decision.kind !== "EXECUTE" ||
      p.environment !== "production" ||
      !p.service ||
      !p.gitSha
    ) {
      return rehydrateDeploymentState({ approvals: {} });
    }
    // Reproduce the approval that the original adjudication consulted.
    const approvalKey = `${p.environment}/${p.service}/${p.gitSha}`;
    return rehydrateDeploymentState({
      approvals: {
        [approvalKey]: {
          service: p.service,
          environment: p.environment,
          gitSha: p.gitSha,
          approver: "operator-replay-synthetic",
          decision: "approved",
          at: record.envelope.createdAt,
        },
      },
    });
  },
};
