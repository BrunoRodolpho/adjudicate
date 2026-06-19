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

/**
 * 025 (capabilities-as-budgets) — the budget-CAPABLE intent kinds.
 *
 * A standing, human-granted, BOUNDED budget grant may satisfy the "ask first"
 * threshold for these kinds WITHOUT a per-intent confirmation receipt — up to the
 * grant's declared limit per window. The host wires
 * `AdjudicatedAgentOptions.budget.resolveGrant` to return a grant ONLY for a kind
 * in THIS set; the kernel substitution still fires ONLY on a REQUEST_CONFIRMATION
 * outcome and NEVER weakens any state/taint/auth/business guard (§C / §D #2).
 *
 * `access.request` and `access.revoke` are the LLM-proposable access mutations a
 * bounded budget can relieve friction for (e.g. an admin pre-authorizes up to N
 * low-risk access grants per window). `access.review.resolve` and
 * `access.breakglass` are system-only (never LLM-proposable) — not budget-capable.
 */
export const ACCESS_BUDGET_CAPABLE_INTENTS = [
  "access.request",
  "access.revoke",
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
