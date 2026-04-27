/**
 * @adjudicate/pack-payments-pix — refusal taxonomy.
 *
 * Typed builders for every refusal the Pack's policy emits. The
 * machine-readable `code` is a stable contract — observability, drift
 * detection (Phase 6), and audit-record analytics key off it. Codes follow
 * the dotted convention prefixed by the domain (`pix.charge.*`).
 *
 * The user-facing copy lives here in one place — i18n is the adopter's
 * responsibility; this Pack ships English strings.
 */

import { refuse, type Refusal } from "@adjudicate/core";

// ── State refusals ──────────────────────────────────────────────────────

export const refuseChargeNotFound = (chargeId: string): Refusal =>
  refuse(
    "STATE",
    "pix.charge.not_found",
    "We couldn't find a PIX charge with that ID.",
    `chargeId=${chargeId}`,
  );

export const refuseChargeAlreadyRefunded = (chargeId: string): Refusal =>
  refuse(
    "STATE",
    "pix.charge.already_refunded",
    "That PIX charge has already been refunded.",
    `chargeId=${chargeId}`,
  );

export const refuseChargeNotConfirmed = (
  chargeId: string,
  status: string,
): Refusal =>
  refuse(
    "STATE",
    "pix.charge.not_confirmed",
    "That PIX charge isn't in the right state for this action.",
    `chargeId=${chargeId} status=${status}`,
  );

export const refuseInvalidStateForConfirm = (
  chargeId: string,
  status: string,
): Refusal =>
  refuse(
    "STATE",
    "pix.charge.invalid_state_for_confirm",
    "That PIX charge can't be confirmed in its current state.",
    `chargeId=${chargeId} status=${status}`,
  );

export const refuseChargeExpired = (chargeId: string): Refusal =>
  refuse(
    "STATE",
    "pix.charge.expired",
    "This PIX charge has expired. Generate a new QR to continue.",
    `chargeId=${chargeId}`,
  );

export const refuseChargeFailed = (chargeId: string): Refusal =>
  refuse(
    "STATE",
    "pix.charge.failed",
    "This PIX charge failed. Please try again.",
    `chargeId=${chargeId}`,
  );

// ── Auth refusals ───────────────────────────────────────────────────────

export const refuseConfirmRequiresWebhook = (): Refusal =>
  refuse(
    "AUTH",
    "pix.charge.confirm_requires_webhook",
    "PIX confirmation must come from the payment provider.",
  );

// ── Business refusals ───────────────────────────────────────────────────

export const refuseInvalidAmount = (amount: unknown): Refusal =>
  refuse(
    "BUSINESS_RULE",
    "pix.charge.amount_invalid",
    "The charge amount must be a positive integer in centavos.",
    `amount=${String(amount)}`,
  );

export const refuseRateLimitExceeded = (count: number, cap: number): Refusal =>
  refuse(
    "BUSINESS_RULE",
    "pix.charge.rate_limit_exceeded",
    "Too many payment attempts. Wait a few minutes before retrying.",
    `count=${count}, cap=${cap}`,
  );
