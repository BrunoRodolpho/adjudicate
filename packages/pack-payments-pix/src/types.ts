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
  | "expired";

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

/** Signal name the deferred `pix.charge.create` intent resumes on. */
export const PIX_CHARGE_CONFIRMED_SIGNAL = "pix.charge.confirmed";

/** Default deadline for a pending charge before it expires. */
export const PIX_CHARGE_DEFER_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
