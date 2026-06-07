import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type IncidentIntentKind =
  | "incident.remediation.execute"
  | "incident.escalate"
  | "incident.monitor.callback";

export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus =
  | "open"
  | "investigating"
  | "remediating"
  | "resolved"
  | "escalated";

export interface IncidentDependency {
  readonly service: string;
  readonly status: "up" | "down" | "degraded";
}

export interface Incident {
  readonly id: string;
  readonly severity: IncidentSeverity;
  readonly status: IncidentStatus;
  readonly dependencies: ReadonlyArray<IncidentDependency>;
  readonly createdAt: string;
}

export interface IncidentState {
  readonly incidents: ReadonlyMap<string, Incident>;
}

export interface IncidentContext {
  readonly operatorId: string;
  readonly oncallTeam: string;
}

export interface RemediationExecutePayload {
  readonly incidentId: string;
  readonly action: string;
  /** Hosts/services the auto-remediation would affect (integer ≥ 0). */
  readonly blastRadius: number;
}

export interface IncidentEscalatePayload {
  readonly incidentId: string;
  readonly reason: string;
}

export interface MonitorCallbackPayload {
  readonly incidentId: string;
  readonly probeId: string;
  readonly observedStatus: IncidentStatus;
  readonly observedAt: string;
}

/** Monitor callbacks are system-only (TRUSTED) — the LLM cannot forge them. */
export const incidentTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["incident.monitor.callback"],
});

export const INCIDENT_DEPENDENCY_RESTORED_SIGNAL = "incident.dependency.restored";
export const INCIDENT_DEFAULT_DEFER_TIMEOUT_MS = 10 * 60 * 1000;
/** Auto (UNTRUSTED, LLM-proposed) remediation is clamped to this blast radius. */
export const AUTO_REMEDIATION_BLAST_CAP = 5;
/** Operator remediation at/above this blast radius needs confirmation. */
export const CONFIRM_BLAST_RADIUS = 10;
/** Operator remediation at/above this blast radius escalates to a supervisor. */
export const ESCALATE_BLAST_RADIUS = 25;

const TERMINAL: ReadonlySet<IncidentStatus> = new Set(["resolved"]);
export function isTerminal(status: IncidentStatus): boolean {
  return TERMINAL.has(status);
}
