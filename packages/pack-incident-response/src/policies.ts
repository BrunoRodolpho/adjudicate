import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  resolveOwnership,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  createAuthorityGuard,
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

// ── Authority guard (034/201) ─────────────────────────────────────────────────

/**
 * The mutating UNTRUSTED-min kinds the constitutional authority guard (034)
 * gates: `incident.remediation.execute` and `incident.escalate`. The TRUSTED-only
 * `incident.monitor.callback` is EXCLUDED — the taint gate already short-circuits
 * an UNTRUSTED proposal of it (it is system-only), so it is not an owner-predicate
 * candidate (the same exclusion pix applies to `pix.charge.confirm`).
 */
const INCIDENT_AUTHORITY_GATED_KINDS: ReadonlySet<IncidentIntentKind> =
  new Set<IncidentIntentKind>([
    "incident.remediation.execute",
    "incident.escalate",
  ]);

/**
 * 201 — wire the constitutional authority guard (034) into incident `authGuards`,
 * closing the §D #8 / 035-F1 violation that the mutating UNTRUSTED-min kinds
 * previously shipped with `authGuards: []`. The guard reads its authority context
 * from the INJECTED `state.authority` (032/033) — the kernel never hands a guard
 * an identity arg.
 *
 * Engagement is gated on the host having injected `state.authority` (the
 * documented host injection seam — see `IncidentAuthorityContext`). When absent
 * the guard returns `null` (inert) — the pre-201 standalone-demo posture. §D #8
 * is enforced STRUCTURALLY by AC-007 (the guard is present in authGuards) and
 * becomes binding + fail-closed at runtime once the host injects authority. The
 * `resource` an envelope names is the incident id / blast-radius target; the
 * AUTHENTICATED principal comes from `state.authority.principalOf(actor.sessionId)`
 * — NOT from `IncidentContext.operatorId`.
 */
const enforceResourceOwnership: IncidentGuard = createAuthorityGuard<
  IncidentIntentKind,
  unknown,
  IncidentState
>(
  // Resolver: read ownership from the injected authority-graph store. `matches`
  // gates out the no-authority case, so a throw here means the host injected
  // authority but the store is broken (fail-closed: createAuthorityGuard REFUSEs).
  (envelope, state) => resolveOwnership(state.authority!.store, envelope),
  {
    // Engage ONLY for the mutating UNTRUSTED kinds AND only when the host injected
    // the authority context. No injected authority ⇒ inert (null).
    matches: (envelope, state) =>
      state.authority !== undefined &&
      INCIDENT_AUTHORITY_GATED_KINDS.has(envelope.kind),
    // IDOR-closing identity seam: resolve the AUTHENTICATED principal from the
    // host session→identity map (NEVER from resourceRefs.owner, NEVER from
    // IncidentContext.operatorId). A host that injects authority but supplies NO
    // `principalOf` yields `null` here, which createAuthorityGuard treats as an
    // unresolved authenticated principal and REFUSEs — fail-CLOSED.
    authenticatedPrincipal: (envelope, state) =>
      state.authority?.principalOf?.(envelope.actor.sessionId) ?? null,
  },
);

export const incidentPolicyBundle: PolicyBundle<IncidentIntentKind, unknown, IncidentState> = {
  stateGuards: [validateRemediationTarget, validateBlastRadius],
  // 201 — constitutional authority guard (034) gating the mutating UNTRUSTED
  // kinds (§D #8). Runs after taint, before business (kernel order). Inert when
  // the host injects no authority context; binding + fail-closed when it does.
  authGuards: [enforceResourceOwnership],
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
