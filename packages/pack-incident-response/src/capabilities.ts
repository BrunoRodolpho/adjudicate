/**
 * @adjudicate/pack-incident-response — CapabilityPlanner.
 *
 * **023 — bound payload at the executor seam.** A remediation intent this
 * planner exposes (`incident.remediation.execute` / `incident.escalate`) reaches
 * the adopter's executor ONLY through a binding-enforced seam — the adapter-core
 * loop (`runExecute` / `verifyResourceBinding`) or the Adjutant orchestrator's
 * `assertResourceBound` fence. The executor honors ONLY the exact `payload`
 * (e.g. the `incidentId` / `blastRadius`) the kernel adjudicated; a post-decision
 * swap fail-closes before `invokeIntent` (anti-IDOR; invariants #1, #6).
 */
import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type Plan,
  type ToolClassification,
} from "@adjudicate/core/llm";
import type { IncidentContext, IncidentIntentKind, IncidentState } from "./types.js";

export const INCIDENT_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_incidents", "get_incident"]),
  MUTATING: new Set(["execute_remediation", "escalate_incident"]),
};

/**
 * 024 (T4) — the Pack's declared intent kinds, named HERE so the pack-bound
 * `safePlan(planner, classification, { intents })` form engages
 * `assertPlanSubsetOfPack` on every `plan()` WITHOUT a planner↔pack construction
 * cycle. `index.ts` reuses this tuple for its `intents` field so the two cannot
 * drift. `incident.monitor.callback` is system-only (never LLM-proposable) but is
 * still a declared intent kind, so it belongs in the subset set.
 */
export const INCIDENT_INTENTS = [
  "incident.remediation.execute",
  "incident.escalate",
  "incident.monitor.callback",
] as const satisfies readonly IncidentIntentKind[];

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
 * `incident.remediation.execute` is the LLM-proposable remediation action a
 * bounded budget can relieve friction for (e.g. an SRE pre-authorizes up to N
 * remediations per window during an active incident). `incident.escalate` only
 * RAISES friction (never threshold-gated) and `incident.monitor.callback` is
 * system-only — neither is budget-capable.
 */
export const INCIDENT_BUDGET_CAPABLE_INTENTS = [
  "incident.remediation.execute",
] as const satisfies readonly IncidentIntentKind[];

const rawIncidentCapabilityPlanner: CapabilityPlanner<IncidentState, IncidentContext> = {
  plan(state): Plan {
    const active = Array.from(state.incidents.values()).filter(
      (i) => i.status !== "resolved",
    );
    const allTools: string[] = ["list_incidents", "get_incident", "escalate_incident"];
    const allowedIntents: string[] = ["incident.escalate"];
    if (active.length > 0) {
      allTools.push("execute_remediation");
      allowedIntents.push("incident.remediation.execute");
    }
    // incident.monitor.callback is system-only — never LLM-proposable.
    return { visibleReadTools: filterReadOnly(INCIDENT_TOOLS, allTools), allowedIntents };
  },
};

// 024 (T4) — the pack-bound 3-arg form `safePlan(planner, classification, pack)`:
// the `pack` ({ intents }) surface engages `assertPlanSubsetOfPack` on every plan().
const classification = INCIDENT_TOOLS;
const pack = { intents: INCIDENT_INTENTS };
export const incidentCapabilityPlanner: CapabilityPlanner<IncidentState, IncidentContext> =
  safePlan(rawIncidentCapabilityPlanner, classification, pack);
