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
