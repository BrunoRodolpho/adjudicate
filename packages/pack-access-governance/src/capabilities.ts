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
import type { AccessContext, AccessIntentKind, AccessState } from "./types.js";

export const ACCESS_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_access_reviews", "list_grants"]),
  MUTATING: new Set(["request_access", "revoke_access"]),
};

/**
 * 024 (T4) — the Pack's declared intent kinds, named HERE so the pack-bound
 * `safePlan(planner, classification, { intents })` form engages
 * `assertPlanSubsetOfPack` on every `plan()` WITHOUT a planner↔pack construction
 * cycle. `index.ts` reuses this tuple for its `intents` field so the two cannot
 * drift. `access.review.resolve` / `access.breakglass` are system-only (never
 * LLM-proposable) but are still declared intent kinds, so they belong in the set.
 */
export const ACCESS_INTENTS = [
  "access.request",
  "access.review.resolve",
  "access.revoke",
  "access.breakglass",
] as const satisfies readonly AccessIntentKind[];

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

// 024 (T4) — the pack-bound 3-arg form `safePlan(planner, classification, pack)`:
// the `pack` ({ intents }) surface engages `assertPlanSubsetOfPack` on every plan().
const classification = ACCESS_TOOLS;
const pack = { intents: ACCESS_INTENTS };
export const accessCapabilityPlanner: CapabilityPlanner<AccessState, AccessContext> =
  safePlan(rawAccessCapabilityPlanner, classification, pack);
