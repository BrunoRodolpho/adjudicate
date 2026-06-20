import type { AuthorityGraphStore } from "@adjudicate/core";
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

/**
 * 201 — OPTIONAL injected authority context (032/033/034), mirroring
 * `PixAuthorityContext`. When the host injects it, the authority guard in
 * `authGuards` is BINDING for the mutating UNTRUSTED-min kinds
 * `incident.remediation.execute` / `incident.escalate`; when absent the guard is
 * inert (pre-201 demo posture).
 *
 * Host-injection contract for incident: the `resource` an envelope's
 * `resourceRefs.resource` names is the incident id / blast-radius target the
 * remediation or escalation acts on (the resource whose owner must authorize the
 * action), and `resourceRefs.owner` is the principal the host's authority graph
 * binds to that target. The AUTHENTICATED principal comes from
 * `state.authority.principalOf(actor.sessionId)` — NOT from `IncidentContext.operatorId`.
 *
 * ⚠️ IDOR residual (034-F1/F2). `principalOf` is the seam that actually closes
 * IDOR. The host MUST resolve the AUTHENTICATED acting principal from a trusted
 * session→identity map keyed by `actor.sessionId` — NEVER from
 * `resourceRefs.owner` (attacker-controlled) — and its namespace MUST match the
 * authority-graph principal names. WITHOUT `principalOf`, the guard fails CLOSED
 * (REFUSE) rather than falling back to bare declared-owner binding.
 */
export interface IncidentAuthorityContext {
  /** The injected authority-graph snapshot store (032/033). */
  readonly store: AuthorityGraphStore;
  /**
   * IDOR-closing host-identity seam. Resolves the AUTHENTICATED acting principal
   * from `actor.sessionId` (a trusted host session→identity map) — NEVER from
   * `resourceRefs.owner`. Return `null` for an unauthenticated/unknown session
   * (the guard then REFUSEs, fail-closed). Omit only when the host has no
   * identity model AND accepts the documented IDOR residual.
   */
  readonly principalOf?: (sessionId: string) => string | null;
}

export interface IncidentState {
  readonly incidents: ReadonlyMap<string, Incident>;
  /**
   * 201 — OPTIONAL injected authority context (032/033/034). When present, the
   * authority guard in `authGuards` is binding for the mutating UNTRUSTED-min
   * kinds (`incident.remediation.execute` / `incident.escalate`); when absent the
   * guard is inert. See `IncidentAuthorityContext` for the IDOR residual. NOT
   * serialized by `rehydrateIncidentState` (the store / identity are host infra,
   * not incident state) → never enters the audit/replay hash (invariant #4/#5 safe).
   */
  readonly authority?: IncidentAuthorityContext;
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
