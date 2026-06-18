/**
 * @adjudicate/pack-access-governance — CapabilityPlanner.
 *
 * **023 — bound payload at the executor seam.** An access intent this planner
 * exposes (`access.request` / `access.revoke`) reaches the adopter's executor
 * ONLY through the adapter-core loop's binding gate (`runExecute` /
 * `verifyResourceBinding`): the executor honors ONLY the exact `payload` /
 * `resourceRefs` (e.g. the grant / principal the revoke targets) the kernel
 * adjudicated. An LLM that swaps the target after the decision fail-closes
 * upstream and never reaches the executor (anti-IDOR; invariants #1, #6).
 */
import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type Plan,
  type ToolClassification,
} from "@adjudicate/core/llm";
import type { AccessContext, AccessState } from "./types.js";

export const ACCESS_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_access_reviews", "list_grants"]),
  MUTATING: new Set(["request_access", "revoke_access"]),
};

const rawAccessCapabilityPlanner: CapabilityPlanner<AccessState, AccessContext> = {
  plan(state): Plan {
    const allTools: string[] = ["list_access_reviews", "list_grants", "request_access"];
    const allowedIntents: string[] = ["access.request"];
    if (state.grants.size > 0) {
      allTools.push("revoke_access");
      allowedIntents.push("access.revoke");
    }
    // access.review.resolve is system-only — never LLM-proposable.
    return { visibleReadTools: filterReadOnly(ACCESS_TOOLS, allTools), allowedIntents };
  },
};

export const accessCapabilityPlanner: CapabilityPlanner<AccessState, AccessContext> = safePlan(
  rawAccessCapabilityPlanner,
  ACCESS_TOOLS,
);
