/**
 * @adjudicate/pack-payments-pix — PolicyBundle.
 *
 * Demonstrates all six Decision outcomes against a small but realistic
 * payment-domain surface. Reading the guards in order is the best
 * documentation of the Pack's behavior:
 *
 *   - State guards refuse charges-not-found, not-confirmed, and
 *     already-refunded targets for the relevant kind.
 *   - Business guards: validate amount, REWRITE-clamp refund > original,
 *     ESCALATE refunds above the supervisor threshold, REQUEST_CONFIRMATION
 *     for medium refunds, DEFER charge.create on the provider webhook
 *     signal, EXECUTE valid confirms and small valid refunds.
 *
 * Order matters within `business`: the REWRITE clamp runs before the
 * threshold-based ESCALATE / REQUEST_CONFIRMATION guards, because the
 * thresholds compare against the (possibly-clamped) requested amount.
 */

import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  resolveOwnership,
} from "@adjudicate/core";
import { nameGuard, type Guard, type PolicyBundle } from "@adjudicate/core/kernel";
import {
  createAuthorityGuard,
  createStateDeferGuard,
  createThresholdGuard,
} from "@adjudicate/primitives";
import {
  PIX_CONFIRMATION_SIGNAL,
  PIX_DEFAULT_DEFER_TIMEOUT_MS,
  pixTaintPolicy,
  type PixIntentKind,
  type PixState,
} from "./types.js";
import {
  refuseChargeAlreadyRefunded,
  refuseChargeNotConfirmed,
  refuseChargeNotFound,
  refuseInvalidAmount,
  refuseInvalidStateForConfirm,
} from "./refusals.js";

type PixGuard = Guard<PixIntentKind, unknown, PixState>;

/**
 * Refunds at or above this threshold (in centavos) ESCALATE to a supervisor.
 * R$ 1,000.00 by default. Adopters compose their own PolicyBundle that wraps
 * these guards if they need different thresholds (covered in the runbook).
 */
export const ESCALATE_REFUND_THRESHOLD_CENTAVOS = 100_000;

/**
 * Refunds at or above this threshold (in centavos) REQUEST_CONFIRMATION
 * from the user before EXECUTE. R$ 500.00 by default.
 */
export const CONFIRM_REFUND_THRESHOLD_CENTAVOS = 50_000;

// ── State guards ────────────────────────────────────────────────────────

/**
 * ESCALATE: a confirm event landing on a charge already marked `failed`
 * can't be auto-handled. A human reviews the provider event vs the local
 * record before any further action. Runs BEFORE `validateConfirmTarget`
 * so the not-pending status produces the operationally-correct outcome.
 */
const escalateFailedConfirm: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.confirm") return null;
  const { chargeId } = envelope.payload as { chargeId: string };
  const charge = state.charges.get(chargeId);
  if (!charge || charge.status !== "failed") return null;
  return decisionEscalate(
    "human",
    `Confirm event arrived for charge ${chargeId} marked as failed; manual review required.`,
    [
      basis("state", BASIS_CODES.state.TERMINAL_STATE, {
        reason: "confirm_on_failed_charge",
        chargeId,
        status: charge.status,
      }),
    ],
  );
};

const validateConfirmTarget: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.confirm") return null;
  const { chargeId } = envelope.payload as { chargeId: string };
  const charge = state.charges.get(chargeId);
  if (!charge) {
    return decisionRefuse(refuseChargeNotFound(chargeId), [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
        kind: envelope.kind,
        chargeId,
      }),
    ]);
  }
  if (charge.status !== "pending") {
    return decisionRefuse(
      refuseInvalidStateForConfirm(chargeId, charge.status),
      [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
          kind: envelope.kind,
          chargeId,
          status: charge.status,
        }),
      ],
    );
  }
  return null;
};

const validateRefundTarget: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  const { chargeId } = envelope.payload as { chargeId: string };
  const charge = state.charges.get(chargeId);
  if (!charge) {
    return decisionRefuse(refuseChargeNotFound(chargeId), [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
        kind: envelope.kind,
        chargeId,
      }),
    ]);
  }
  if (charge.status === "refunded") {
    return decisionRefuse(refuseChargeAlreadyRefunded(chargeId), [
      basis("state", BASIS_CODES.state.TERMINAL_STATE, {
        kind: envelope.kind,
        chargeId,
      }),
    ]);
  }
  if (charge.status !== "confirmed") {
    return decisionRefuse(
      refuseChargeNotConfirmed(chargeId, charge.status),
      [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
          kind: envelope.kind,
          chargeId,
          status: charge.status,
        }),
      ],
    );
  }
  return null;
};

// ── Business guards ─────────────────────────────────────────────────────

const validateChargeAmount: PixGuard = (envelope) => {
  if (envelope.kind !== "pix.charge.create") return null;
  const { amountCentavos } = envelope.payload as { amountCentavos: unknown };
  if (
    typeof amountCentavos !== "number" ||
    !Number.isInteger(amountCentavos) ||
    amountCentavos <= 0
  ) {
    return decisionRefuse(refuseInvalidAmount(amountCentavos), [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        rule: "positive_integer_centavos",
        seen: amountCentavos,
      }),
    ]);
  }
  return null;
};

const clampRefundToOriginal: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  const payload = envelope.payload as {
    readonly chargeId: string;
    readonly refundCentavos: number;
    readonly reason: string;
  };
  const charge = state.charges.get(payload.chargeId);
  if (!charge) return null; // earlier state guard refused
  if (payload.refundCentavos <= charge.amountCentavos) return null;
  const rewritten = buildEnvelope({
    kind: envelope.kind,
    payload: { ...payload, refundCentavos: charge.amountCentavos },
    actor: envelope.actor,
    taint: envelope.taint,
    nonce: envelope.nonce,
    createdAt: envelope.createdAt,
  });
  return decisionRewrite(
    rewritten,
    `Refund clamped to original charge amount.`,
    [
      basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
        chargeId: payload.chargeId,
        requested: payload.refundCentavos,
        cappedTo: charge.amountCentavos,
      }),
    ],
  );
};

/**
 * Refunds at or above `ESCALATE_REFUND_THRESHOLD_CENTAVOS` ESCALATE to a
 * supervisor. Layer-2 `createThresholdGuard` encodes the
 * "match → extract → compare → onCross" plumbing; this declaration only
 * carries domain values (intent kind, threshold, escalation reason).
 *
 * Ordered AFTER `clampRefundToOriginal` so the threshold compares against
 * the (possibly-clamped) requested amount, not the original payload.
 */
const escalateLargeRefunds = nameGuard(
  "escalateLargeRefunds",
  createThresholdGuard<PixIntentKind, unknown, PixState>({
    matches: (env) => env.kind === "pix.charge.refund",
    extract: (env) =>
      (env.payload as { refundCentavos: number }).refundCentavos,
    threshold: ESCALATE_REFUND_THRESHOLD_CENTAVOS,
    comparator: ">=",
    onCross: (requested, threshold) =>
      decisionEscalate(
        "supervisor",
        `Refund of ${requested} centavos exceeds the supervisor threshold.`,
        [
          basis("business", BASIS_CODES.business.RULE_SATISFIED, {
            rule: "supervisor_threshold_reached",
            threshold,
            requested,
          }),
        ],
      ),
  }),
);

/**
 * Refunds at or above `CONFIRM_REFUND_THRESHOLD_CENTAVOS` (but below the
 * supervisor escalation threshold) prompt the user to confirm.
 */
const requestConfirmForMediumRefund = nameGuard(
  "requestConfirmForMediumRefund",
  createThresholdGuard<PixIntentKind, unknown, PixState>({
    matches: (env) => env.kind === "pix.charge.refund",
    extract: (env) =>
      (env.payload as { refundCentavos: number }).refundCentavos,
    threshold: CONFIRM_REFUND_THRESHOLD_CENTAVOS,
    comparator: ">=",
    onCross: (requested, threshold) =>
      decisionRequestConfirmation(
        `You're about to refund R$ ${(requested / 100).toFixed(2)}. Confirm?`,
        [
          basis("business", BASIS_CODES.business.RULE_SATISFIED, {
            rule: "confirm_threshold_reached",
            threshold,
            requested,
          }),
        ],
      ),
  }),
);

/**
 * `pix.charge.create` parks until the provider's webhook fires the
 * `PIX_CONFIRMATION_SIGNAL`. Layer-2 `createStateDeferGuard` carries
 * the wire mechanics (signal name + timeout) so the Pack only declares
 * which intent kind triggers and what basis the audit trail records.
 */
const deferChargeCreate = nameGuard(
  "deferChargeCreate",
  createStateDeferGuard<PixIntentKind, unknown, PixState>({
    matches: (env) => env.kind === "pix.charge.create",
    signal: PIX_CONFIRMATION_SIGNAL,
    timeoutMs: PIX_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_provider_confirmation",
        waitFor: PIX_CONFIRMATION_SIGNAL,
      }),
    ],
  }),
);

// Positive EXECUTE guards — required because policy.default is REFUSE.

const executeConfirmedCharge: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.confirm") return null;
  const { chargeId } = envelope.payload as { chargeId: string };
  const charge = state.charges.get(chargeId);
  if (!charge || charge.status !== "pending") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      chargeId,
    }),
  ]);
};

/**
 * Logical namespace marker for managed-agent sessions. Kept as a literal — the
 * pix Pack must not depend on an adopter's agents package (wrong direction):
 * the production planner stamps envelope.actor.sessionId = `agent:<id>@<ver>:…`.
 */
const AGENT_SESSION_NAMESPACE = "agent:";

/**
 * B1 — agent-session refunds ALWAYS confirm. A managed-agent trigger that
 * proposes a `pix.charge.refund` (actor.sessionId in the `agent:` namespace)
 * adjudicates to REQUEST_CONFIRMATION regardless of amount, so wire-PSP money
 * never moves on an agent's say-so — a human resolves the parked approval, and
 * the kernel's confirmationReceipt converts the re-adjudicated decision to
 * EXECUTE. Keyed on the sessionId NAMESPACE, NOT the principal: the production
 * planner stamps principal:"llm" for agent triggers and the principal union
 * (`llm | user | system`) has no `agent:` member — agent identity rides
 * actor.sessionId. Ordered BEFORE the escalate/threshold/execute guards so it
 * pre-empts them (an agent refund confirms whatever the amount).
 */
const confirmAgentRefund: PixGuard = (envelope) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  if (!envelope.actor.sessionId.startsWith(AGENT_SESSION_NAMESPACE)) return null;
  return decisionRequestConfirmation(
    "Reembolso proposto por agente — confirmação humana obrigatória.",
    [
      basis("business", BASIS_CODES.business.RULE_SATISFIED, {
        rule: "agent_refund_confirm",
        sessionId: envelope.actor.sessionId,
      }),
    ],
  );
};

const executeValidRefund: PixGuard = (envelope, state) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  const { chargeId, refundCentavos } = envelope.payload as {
    chargeId: string;
    refundCentavos: number;
  };
  const charge = state.charges.get(chargeId);
  if (!charge || charge.status !== "confirmed") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      chargeId,
      refundCentavos,
    }),
  ]);
};

// ── Authority guard (034/035) ─────────────────────────────────────────────

/**
 * The money-moving UNTRUSTED-min kinds the constitutional authority guard (034)
 * gates: `pix.charge.create` and `pix.charge.refund`. `pix.charge.confirm` is
 * the TRUSTED-only provider webhook (the taint gate already short-circuits an
 * UNTRUSTED proposal of it), so it is NOT an owner-predicate candidate.
 */
const PIX_AUTHORITY_GATED_KINDS: ReadonlySet<PixIntentKind> = new Set<PixIntentKind>(
  ["pix.charge.create", "pix.charge.refund"],
);

/**
 * 035 — wire the constitutional authority guard (034) into PIX `authGuards`,
 * closing the §D #8 violation that money-moving kinds previously shipped with
 * `authGuards: []`. The guard reads its authority context from the INJECTED
 * `state.authority` (032/033) — the kernel never hands a guard an identity arg.
 *
 * Engagement is gated on the host having injected `state.authority` (the
 * documented host injection seam — see `PixAuthorityContext`). When the host
 * opts into authority enforcement, the guard is BINDING and fail-closed:
 *
 *   - resolves ownership of the payload's resource from the injected store
 *     (`resolveOwnership`, reading `envelope.resourceRefs.owner`/`resource`);
 *   - REFUSEs (SECURITY/tenant_binding_violation, basis auth.SCOPE_INSUFFICIENT)
 *     when the declared owner is not bound, the ref is absent, or — via the
 *     `principalOf` identity seam — the AUTHENTICATED actor is not that owner
 *     (the IDOR-closing check), and on any resolver throw.
 *
 * When `state.authority` is ABSENT the guard returns `null` (inert) — the
 * pre-035 standalone-demo posture the lighthouse scenarios use (no identity
 * model). This is the residual the run-state mandates documenting: §D #8 is
 * enforced STRUCTURALLY by AC-007 (the guard is present in authGuards), and
 * becomes binding at runtime once the host injects authority. Because there is
 * no production authenticated-identity model yet (034-F1), the host injection
 * point is the only place real IDOR closure can live.
 */
const enforceResourceOwnership: PixGuard = createAuthorityGuard<
  PixIntentKind,
  unknown,
  PixState
>(
  // Resolver: read ownership from the injected authority-graph store. Throws when
  // no authority context is injected — but `matches` gates that case out first,
  // so a throw here means the host injected authority but the store is broken
  // (fail-closed: createAuthorityGuard catches the throw and REFUSEs).
  (envelope, state) => resolveOwnership(state.authority!.store, envelope),
  {
    // Engage ONLY for money-moving UNTRUSTED kinds AND only when the host has
    // injected the authority context. No injected authority ⇒ inert (null).
    matches: (envelope, state) =>
      state.authority !== undefined &&
      PIX_AUTHORITY_GATED_KINDS.has(envelope.kind),
    // IDOR-closing identity seam: resolve the AUTHENTICATED principal from the
    // host session→identity map (NEVER from resourceRefs.owner). createAuthorityGuard
    // engages its IDOR gate because this option is present, so it additionally
    // requires the resolved owner to EQUAL the authenticated actor. A host that
    // injects authority but supplies NO `principalOf` yields `null` here, which
    // createAuthorityGuard treats as an unresolved authenticated principal and
    // REFUSEs — fail-CLOSED. This deliberately does NOT fall back to the bare
    // declared-owner binding (the run-state-flagged false-sense-of-security): if
    // the host enforces authority, it MUST supply a real identity source. Closing
    // IDOR requires a trusted session→identity map whose namespace matches the
    // authority-graph principal names (034-F2).
    authenticatedPrincipal: (envelope, state) =>
      state.authority?.principalOf?.(envelope.actor.sessionId) ?? null,
  },
);

// ── PolicyBundle ────────────────────────────────────────────────────────

export const pixPolicyBundle: PolicyBundle<
  PixIntentKind,
  unknown,
  PixState
> = {
  stateGuards: [
    escalateFailedConfirm,
    validateConfirmTarget,
    validateRefundTarget,
  ],
  // 035 — constitutional authority guard (034) gating money-moving UNTRUSTED
  // kinds (§D #8). Runs after taint, before business (kernel order). Inert when
  // the host injects no authority context; binding + fail-closed when it does.
  authGuards: [enforceResourceOwnership],
  taint: pixTaintPolicy,
  business: [
    validateChargeAmount,
    clampRefundToOriginal,
    // B1: an agent-session refund confirms whatever the amount — pre-empts the
    // escalate/threshold/execute guards below so wire money never auto-moves.
    confirmAgentRefund,
    escalateLargeRefunds,
    requestConfirmForMediumRefund,
    deferChargeCreate,
    executeConfirmedCharge,
    executeValidRefund,
  ],
  /**
   * Fail-safe: an intent that no positive guard matched is denied. Required
   * polarity for a payments domain — the cost of an unintended EXECUTE is
   * real money.
   */
  default: "REFUSE",
};
