/**
 * @adjudicate/pack-incident-response — incident-remediation governance Pack.
 *
 * Exercises all six Decision outcomes for AI-driven incident response:
 *   - DEFER     when a dependent service is down (awaiting restoration)
 *   - REWRITE   clamps an auto (UNTRUSTED) remediation's blast radius
 *   - ESCALATE  when an operator's blast radius exceeds the threshold
 *   - REQUEST_CONFIRMATION before destructive operator remediation
 *   - REFUSE    unknown / already-resolved incidents, invalid blast radius
 *   - EXECUTE   in-bounds remediation, manual escalation, monitor callback
 *
 * Monitor callbacks are system-only (TRUSTED). See README.
 */
import type { PackV0 } from "@adjudicate/core";
import { incidentCapabilityPlanner } from "./capabilities.js";
import { incidentPolicyBundle } from "./policies.js";
import type { Incident, IncidentContext, IncidentIntentKind, IncidentState } from "./types.js";

export function rehydrateIncidentState(raw: unknown): IncidentState {
  if (typeof raw === "object" && raw !== null && "incidents" in raw) {
    const incidents = (raw as { incidents: unknown }).incidents;
    if (incidents instanceof Map) {
      return { incidents: incidents as ReadonlyMap<string, Incident> };
    }
    if (typeof incidents === "object" && incidents !== null) {
      return { incidents: new Map(Object.entries(incidents as Record<string, Incident>)) };
    }
  }
  return { incidents: new Map() };
}

export * from "./types.js";
export { incidentPolicyBundle } from "./policies.js";
export {
  INCIDENT_BUDGET_CAPABLE_INTENTS,
  INCIDENT_TOOLS,
  incidentCapabilityPlanner,
} from "./capabilities.js";
export { refuseIncidentNotFound, refuseIncidentResolved, refuseInvalidBlastRadius } from "./refusals.js";

export const incidentResponsePack = {
  id: "pack-incident-response",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: ["incident.remediation.execute", "incident.escalate", "incident.monitor.callback"],
  policy: incidentPolicyBundle,
  planner: incidentCapabilityPlanner,
  basisCodes: [
    "incident.not_found",
    "incident.already_resolved",
    "incident.blast_radius_invalid",
  ],
  signals: ["incident.dependency.restored"],
  rehydrateState: rehydrateIncidentState,
} as const satisfies PackV0<IncidentIntentKind, unknown, IncidentState, IncidentContext>;
