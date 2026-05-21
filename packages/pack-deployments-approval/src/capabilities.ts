import type { CapabilityPlanner, Plan } from "@adjudicate/core/llm";
import type {
  DeploymentContext,
  DeploymentState,
} from "./types.js";

export const DEPLOYMENT_TOOLS = {
  read: ["deployment.read_service", "deployment.read_approvals"] as const,
  mutating: [
    "deployment.approval.request",
    "deployment.rollback.execute",
    "deployment.approval.resolve",
  ] as const,
} as const;

/**
 * Minimal CapabilityPlanner — gates the LLM to the read tools by default
 * and admits the mutating intents only when a requesterId is present.
 * Adopters wiring this Pack for production typically replace this with one
 * that consults a role/permission table.
 */
export const deploymentCapabilityPlanner: CapabilityPlanner<
  DeploymentState,
  DeploymentContext
> = {
  plan(_state, context): Plan {
    return {
      visibleReadTools: [...DEPLOYMENT_TOOLS.read],
      allowedIntents: context.requesterId
        ? [...DEPLOYMENT_TOOLS.mutating]
        : [],
    };
  },
};
