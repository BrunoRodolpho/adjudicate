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
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
} from "@adjudicate/core";
import type { Guard, PolicyBundle } from "@adjudicate/core/kernel";
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

const escalateLargeRefunds: PixGuard = (envelope) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  const { refundCentavos } = envelope.payload as { refundCentavos: number };
  if (refundCentavos < ESCALATE_REFUND_THRESHOLD_CENTAVOS) return null;
  return decisionEscalate(
    "supervisor",
    `Refund of ${refundCentavos} centavos exceeds the supervisor threshold.`,
    [
      basis("business", BASIS_CODES.business.RULE_SATISFIED, {
        rule: "supervisor_threshold_reached",
        threshold: ESCALATE_REFUND_THRESHOLD_CENTAVOS,
        requested: refundCentavos,
      }),
    ],
  );
};

const requestConfirmForMediumRefund: PixGuard = (envelope) => {
  if (envelope.kind !== "pix.charge.refund") return null;
  const { refundCentavos } = envelope.payload as { refundCentavos: number };
  if (refundCentavos < CONFIRM_REFUND_THRESHOLD_CENTAVOS) return null;
  return decisionRequestConfirmation(
    `You're about to refund R$ ${(refundCentavos / 100).toFixed(2)}. Confirm?`,
    [
      basis("business", BASIS_CODES.business.RULE_SATISFIED, {
        rule: "confirm_threshold_reached",
        threshold: CONFIRM_REFUND_THRESHOLD_CENTAVOS,
        requested: refundCentavos,
      }),
    ],
  );
};

const deferChargeCreate: PixGuard = (envelope) => {
  if (envelope.kind !== "pix.charge.create") return null;
  return decisionDefer(
    PIX_CONFIRMATION_SIGNAL,
    PIX_DEFAULT_DEFER_TIMEOUT_MS,
    [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_provider_confirmation",
        waitFor: PIX_CONFIRMATION_SIGNAL,
      }),
    ],
  );
};

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
  authGuards: [],
  taint: pixTaintPolicy,
  business: [
    validateChargeAmount,
    clampRefundToOriginal,
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
