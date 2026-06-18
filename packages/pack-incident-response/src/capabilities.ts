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
import type { IncidentContext, IncidentState } from "./types.js";

export const INCIDENT_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_incidents", "get_incident"]),
  MUTATING: new Set(["execute_remediation", "escalate_incident"]),
};

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

export const incidentCapabilityPlanner: CapabilityPlanner<IncidentState, IncidentContext> =
  safePlan(rawIncidentCapabilityPlanner, INCIDENT_TOOLS);
