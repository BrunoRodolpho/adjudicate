/**
 * {{className}} — PolicyBundle.
 *
 * Demonstrates five Decision outcomes against a small payment surface:
 *
 *   - REFUSE  : amountCentavos <= 0 (validateAmount)
 *   - REWRITE : refundCentavos > original (clampRefundToOriginal)
 *   - ESCALATE: refund at/above supervisor threshold (escalateLargeRefund)
 *   - DEFER   : payment.create parks awaiting provider webhook
 *   - EXECUTE : positive guards for happy-path confirm/refund
 *
 * Order matters within `business`: REWRITE before ESCALATE so the
 * threshold compares against the (possibly-clamped) requested amount.
 */

import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  refuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  createEscalateGuard,
  createRewriteGuard,
  createStateDeferGuard,
} from "@adjudicate/primitives";
import {
  ESCALATE_REFUND_THRESHOLD_CENTAVOS,
  PAYMENT_CONFIRMATION_SIGNAL,
  PAYMENT_DEFAULT_DEFER_TIMEOUT_MS,
  {{className}}TaintPolicy,
  type {{className}}IntentKind,
  type {{className}}State,
} from "./types.js";

type {{className}}Guard = Guard<{{className}}IntentKind, unknown, {{className}}State>;

// ─── Business guards ───────────────────────────────────────────────────────

/**
 * REFUSE create requests whose amountCentavos isn't a positive integer.
 * Cheapest invariant — runs first so downstream guards may assume a
 * sane amount.
 */
const validateAmount: {{className}}Guard = (envelope) => {
  if (envelope.kind !== "{{intentPrefix}}.payment.create") return null;
  const { amountCentavos } = envelope.payload as { amountCentavos: unknown };
  if (
    typeof amountCentavos !== "number" ||
    !Number.isInteger(amountCentavos) ||
    amountCentavos <= 0
  ) {
    return decisionRefuse(
      refuse(
        "BUSINESS_RULE",
        "{{intentPrefix}}.payment.amount_invalid",
        "Payment amount must be a positive integer (centavos).",
        `seen=${String(amountCentavos)}`,
      ),
      [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, {
          rule: "positive_integer_centavos",
          seen: amountCentavos,
        }),
      ],
    );
  }
  return null;
};

/**
 * REWRITE: clamp refund > original payment amount. Built from the
 * Layer-2 `createRewriteGuard` factory — the Pack only declares which
 * intent kind triggers and what numeric field to clamp.
 */
const clampRefundToOriginal: {{className}}Guard = nameGuard(
  "clampRefundToOriginal",
  createRewriteGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.payment.refund",
    extract: (env) =>
      (env.payload as { refundCentavos: number }).refundCentavos,
    cap: (state, env) => {
      const { paymentId } = env.payload as { paymentId: string };
      const payment = state.payments.get(paymentId);
      return payment ? payment.amountCentavos : Number.POSITIVE_INFINITY;
    },
    mutateField: "refundCentavos",
    reason: "Refund clamped to original payment amount.",
  }),
);

/**
 * ESCALATE: refunds at/above the supervisor threshold. Runs AFTER
 * `clampRefundToOriginal` so the threshold compares against the
 * (possibly-clamped) requested amount.
 */
const escalateLargeRefund: {{className}}Guard = nameGuard(
  "escalateLargeRefund",
  createEscalateGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.payment.refund",
    extract: (env) =>
      (env.payload as { refundCentavos: number }).refundCentavos,
    threshold: ESCALATE_REFUND_THRESHOLD_CENTAVOS,
    comparator: ">=",
    to: "supervisor",
    reason: (requested) =>
      `Refund of ${requested} centavos exceeds the supervisor threshold.`,
  }),
);

/**
 * DEFER: `payment.create` parks until the provider webhook fires
 * `PAYMENT_CONFIRMATION_SIGNAL`.
 */
const deferPaymentCreate: {{className}}Guard = nameGuard(
  "deferPaymentCreate",
  createStateDeferGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.payment.create",
    signal: PAYMENT_CONFIRMATION_SIGNAL,
    timeoutMs: PAYMENT_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_provider_confirmation",
        waitFor: PAYMENT_CONFIRMATION_SIGNAL,
      }),
    ],
  }),
);

// ─── EXECUTE guards (required because policy.default is REFUSE) ───────────

const executeConfirm: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.payment.confirm") return null;
  const { paymentId } = envelope.payload as { paymentId: string };
  const payment = state.payments.get(paymentId);
  if (!payment || payment.status !== "pending") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      paymentId,
    }),
  ]);
};

const executeRefund: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.payment.refund") return null;
  const { paymentId } = envelope.payload as { paymentId: string };
  const payment = state.payments.get(paymentId);
  if (!payment || payment.status !== "confirmed") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      paymentId,
    }),
  ]);
};

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const {{className}}PolicyBundle: PolicyBundle<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = {
  stateGuards: [],
  authGuards: [],
  taint: {{className}}TaintPolicy,
  business: [
    validateAmount,
    clampRefundToOriginal,
    escalateLargeRefund,
    deferPaymentCreate,
    executeConfirm,
    executeRefund,
  ],
  /** Fail-safe: payments require positive-match. */
  default: "REFUSE",
};
