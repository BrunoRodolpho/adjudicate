/**
 * @adjudicate/pack-payments-pix — domain types.
 *
 * PIX is Brazil's instant-payment system. Charges follow an async lifecycle:
 * the merchant creates a charge (pending), the payer scans a QR code or
 * pastes a "PIX key" into their bank app, the payment provider confirms via
 * webhook, then the merchant may issue refunds.
 *
 * The Pack handles three intent kinds:
 *
 *   - `pix.charge.create`  — UNTRUSTED. Merchant (or LLM on its behalf)
 *                            proposes creating a charge. Kernel typically
 *                            DEFERS on the `pix.charge.confirmed` signal.
 *
 *   - `pix.charge.confirm` — TRUSTED. The PIX provider's webhook signals
 *                            payment received. Resumes the deferred intent
 *                            via `resumeDeferredIntent` from
 *                            `@adjudicate/runtime`.
 *
 *   - `pix.charge.refund`  — UNTRUSTED. Merchant proposes a refund (full
 *                            or partial). Kernel REFUSES if charge isn't
 *                            confirmed, REWRITES if refund > original.
 */

import type { TaintPolicy } from "@adjudicate/core";

export type PixIntentKind =
  | "pix.charge.create"
  | "pix.charge.confirm"
  | "pix.charge.refund";

// ── Payloads ────────────────────────────────────────────────────────────

export interface PixChargeCreatePayload {
  /** Amount in centavos (integer). Per CLAUDE.md hard rule #2 — never floats. */
  readonly amountCentavos: number;
  /** Payer's CPF (11 digits) or CNPJ (14 digits), digits only. */
  readonly payerDocument: string;
  /** Free-text description shown to payer in their bank app. */
  readonly description: string;
}

export interface PixChargeConfirmPayload {
  /** Charge id from a prior `pix.charge.create`. */
  readonly chargeId: string;
  /** Provider's transaction id (idempotency key for the webhook). */
  readonly providerTxId: string;
  /** ISO-8601 timestamp from the provider. */
  readonly confirmedAt: string;
}

export interface PixChargeRefundPayload {
  readonly chargeId: string;
  /** Refund amount in centavos. May be REWRITTEN if it exceeds original. */
  readonly refundCentavos: number;
  readonly reason: string;
}

// ── State ───────────────────────────────────────────────────────────────

export type PixChargeStatus =
  | "pending"
  | "confirmed"
  | "refunded"
  | "expired"
  | "failed";

export interface PixCharge {
  readonly id: string;
  readonly amountCentavos: number;
  readonly status: PixChargeStatus;
  readonly createdAt: string;
  readonly confirmedAt?: string;
  readonly refundedAt?: string;
  readonly refundedCentavos?: number;
}

export interface PixState {
  /** All charges, keyed by charge id. Adopter persistence is out of scope. */
  readonly charges: ReadonlyMap<string, PixCharge>;
}

// ── Context ─────────────────────────────────────────────────────────────

export interface PixContext {
  readonly customerId: string;
  readonly merchantId: string;
}

// ── Taint policy ────────────────────────────────────────────────────────

/**
 * Customer-initiated intents (`create`, `refund`) are UNTRUSTED — the LLM
 * may propose them on the customer's behalf, but the kernel's policy
 * decides whether to execute. The webhook intent (`confirm`) requires
 * TRUSTED — only the provider's authenticated webhook should produce it.
 */
export const pixTaintPolicy: TaintPolicy = {
  minimumFor(kind) {
    return kind === "pix.charge.confirm" ? "TRUSTED" : "UNTRUSTED";
  },
};

// ── Domain constants ────────────────────────────────────────────────────

/**
 * Signal name the deferred `pix.charge.create` intent resumes on.
 *
 * Wire value `"payment.confirmed"` matches the production NATS subject
 * IbateXas already publishes from its Stripe webhook subscriber. Future
 * v1.0.0 may rename to `"pix.charge.confirmed"` to align with the intent
 * kind namespace; that would be a documented breaking change with a
 * migration note in CHANGELOG.
 */
export const PIX_CONFIRMATION_SIGNAL = "payment.confirmed";

/**
 * Default deadline for a pending charge before adopters give up on the
 * webhook signal. Passed to `decisionDefer(timeoutMs)`. Adopters using
 * the `createPixPendingDeferGuard` factory may override per call.
 */
export const PIX_DEFAULT_DEFER_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Pack-vocabulary set of statuses that count as "settled" for resume-path
 * detection inside the Pack's policy guards. Distinct from any wire-level
 * status set an adopter maintains for its provider's vocabulary (e.g.
 * IbateXas's `{paid, captured, confirmed}` Stripe set).
 */
export const PIX_CONFIRMED_STATUSES: ReadonlySet<PixChargeStatus> = new Set([
  "confirmed",
]);

/**
 * Default validity window passed to PSPs that accept it. Adopters who
 * want a different default can wrap `pix.charge.create` payloads in a
 * pre-bundle guard that clamps `expiresInSeconds` before adjudication.
 */
export const PIX_DEFAULT_EXPIRY_SECONDS = 60 * 60;
