import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  createConfirmGuard,
  createEscalateGuard,
  createRewriteGuard,
  createStateDeferGuard,
} from "@adjudicate/primitives";
import {
  AUTO_REMEDIATION_BLAST_CAP,
  CONFIRM_BLAST_RADIUS,
  ESCALATE_BLAST_RADIUS,
  INCIDENT_DEFAULT_DEFER_TIMEOUT_MS,
  INCIDENT_DEPENDENCY_RESTORED_SIGNAL,
  incidentTaintPolicy,
  isTerminal,
  type IncidentIntentKind,
  type IncidentState,
  type RemediationExecutePayload,
} from "./types.js";
import { refuseIncidentNotFound, refuseIncidentResolved, refuseInvalidBlastRadius } from "./refusals.js";

type IncidentGuard = Guard<IncidentIntentKind, unknown, IncidentState>;

const remediationPayload = (p: unknown): RemediationExecutePayload =>
  p as RemediationExecutePayload;

// ── state guards ────────────────────────────────────────────────────────────

const validateRemediationTarget: IncidentGuard = nameGuard(
  "validateRemediationTarget",
  (envelope, state) => {
    if (
      envelope.kind !== "incident.remediation.execute" &&
      envelope.kind !== "incident.escalate"
    ) {
      return null;
    }
    const id = (envelope.payload as { incidentId?: string }).incidentId ?? "";
    const incident = state.incidents.get(id);
    if (!incident) {
      return decisionRefuse(refuseIncidentNotFound(id), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, { incidentId: id }),
      ]);
    }
    if (isTerminal(incident.status)) {
      return decisionRefuse(refuseIncidentResolved(id), [
        basis("state", BASIS_CODES.state.TERMINAL_STATE, { incidentId: id }),
      ]);
    }
    return null;
  },
);

const validateBlastRadius: IncidentGuard = nameGuard("validateBlastRadius", (envelope) => {
  if (envelope.kind !== "incident.remediation.execute") return null;
  const br = remediationPayload(envelope.payload).blastRadius;
  if (typeof br !== "number" || !Number.isInteger(br) || br < 0) {
    return decisionRefuse(refuseInvalidBlastRadius(br), [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, { rule: "blast_radius" }),
    ]);
  }
  return null;
});

// ── business guards ─────────────────────────────────────────────────────────

const deferOnDependencyDown: IncidentGuard = nameGuard(
  "deferOnDependencyDown",
  createStateDeferGuard<IncidentIntentKind, unknown, IncidentState>({
    matches: (envelope, state) => {
      if (envelope.kind !== "incident.remediation.execute") return false;
      const id = remediationPayload(envelope.payload).incidentId;
      const incident = state.incidents.get(id);
      return incident !== undefined && incident.dependencies.some((d) => d.status === "down");
    },
    signal: INCIDENT_DEPENDENCY_RESTORED_SIGNAL,
    timeoutMs: INCIDENT_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "dependency_down",
        waitFor: INCIDENT_DEPENDENCY_RESTORED_SIGNAL,
      }),
    ],
  }),
);

// Auto (UNTRUSTED, LLM-proposed) remediation is clamped to the auto cap.
// Operator (TRUSTED) remediation bypasses the clamp → flows to confirm/escalate.
const clampAutoRemediationScope: IncidentGuard = nameGuard(
  "clampAutoRemediationScope",
  createRewriteGuard<IncidentIntentKind, unknown, IncidentState>({
    matches: (envelope) =>
      envelope.kind === "incident.remediation.execute" && envelope.taint !== "TRUSTED",
    extract: (envelope) => remediationPayload(envelope.payload).blastRadius,
    cap: AUTO_REMEDIATION_BLAST_CAP,
    mutateField: "blastRadius",
    reason: "Clamped auto-remediation blast radius to the safe ceiling.",
  }),
);

const escalateLargeBlastRadius: IncidentGuard = nameGuard(
  "escalateLargeBlastRadius",
  createEscalateGuard<IncidentIntentKind, unknown, IncidentState>({
    matches: (envelope) => envelope.kind === "incident.remediation.execute",
    extract: (envelope) => remediationPayload(envelope.payload).blastRadius,
    threshold: ESCALATE_BLAST_RADIUS,
    comparator: ">=",
    to: "supervisor",
    reason: (value) => `Remediation blast radius ${value} exceeds the escalation threshold.`,
  }),
);

const confirmDestructiveRemediation: IncidentGuard = nameGuard(
  "confirmDestructiveRemediation",
  createConfirmGuard<IncidentIntentKind, unknown, IncidentState>({
    matches: (envelope) => envelope.kind === "incident.remediation.execute",
    extract: (envelope) => remediationPayload(envelope.payload).blastRadius,
    threshold: CONFIRM_BLAST_RADIUS,
    comparator: ">=",
    prompt: (value) => `Confirm remediation affecting ${value} hosts? This is destructive.`,
  }),
);

const executeMonitorCallback: IncidentGuard = nameGuard("executeMonitorCallback", (envelope) =>
  envelope.kind === "incident.monitor.callback"
    ? decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID, { source: "monitor" })])
    : null,
);

const executeRemediation: IncidentGuard = nameGuard("executeRemediation", (envelope) =>
  envelope.kind === "incident.remediation.execute"
    ? decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED, { rule: "in_bounds_remediation" })])
    : null,
);

const executeEscalate: IncidentGuard = nameGuard("executeEscalate", (envelope) =>
  envelope.kind === "incident.escalate"
    ? decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED, { rule: "manual_escalation" })])
    : null,
);

export const incidentPolicyBundle: PolicyBundle<IncidentIntentKind, unknown, IncidentState> = {
  stateGuards: [validateRemediationTarget, validateBlastRadius],
  authGuards: [],
  taint: incidentTaintPolicy,
  business: [
    deferOnDependencyDown,
    clampAutoRemediationScope,
    escalateLargeBlastRadius,
    confirmDestructiveRemediation,
    executeMonitorCallback,
    executeRemediation,
    executeEscalate,
  ],
  default: "REFUSE",
};
