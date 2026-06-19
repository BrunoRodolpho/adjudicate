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

import type { AuthorityGraphStore } from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";

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

/**
 * The host-supplied authority context the constitutional authority guard (034)
 * reads from `state` (the kernel never hands a guard an identity argument — auth
 * facts flow through `state`, `packages/core/src/kernel/policy.ts`). INJECTED as
 * an immutable snapshot (index §B/§D): the authority-graph store (032/033) plus
 * the IDOR-closing host-identity seam.
 *
 * OPTIONAL by design (035 wiring contract). When absent, the authority guard is
 * inert (returns `null`) — the pre-035 standalone-demo posture the lighthouse
 * scenarios/fixtures use, which carry no identity model. When PRESENT, the guard
 * is binding and fail-closed: it REFUSEs a money-moving UNTRUSTED kind whose
 * declared owner (`envelope.resourceRefs.owner`) is not bound to the resource in
 * `store`, AND (via `principalOf`) whose AUTHENTICATED actor is not that owner.
 *
 * ⚠️ IDOR residual (034-F1/F2). `principalOf` is the seam that actually closes
 * IDOR. The host MUST resolve the AUTHENTICATED acting principal from a trusted
 * session→identity map keyed by `actor.sessionId` — NEVER from
 * `resourceRefs.owner` (attacker-controlled) — and its namespace MUST match the
 * authority-graph principal names. WITHOUT `principalOf`, the guard only enforces
 * "the declared owner genuinely owns the resource" and does NOT close IDOR (a
 * forged-but-bound owner ref passes). There is no production authenticated-
 * identity data model yet (`IntentActor.principal` is the provenance enum;
 * `attest()` is a v0.2 stub), so this is the documented host injection point.
 */
export interface PixAuthorityContext {
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

export interface PixState {
  /** All charges, keyed by charge id. Adopter persistence is out of scope. */
  readonly charges: ReadonlyMap<string, PixCharge>;
  /**
   * OPTIONAL injected authority context (032/033/034). When present, the
   * authority guard in `authGuards` is binding for money-moving UNTRUSTED kinds
   * (`pix.charge.create`/`refund`); when absent the guard is inert. See
   * `PixAuthorityContext` for the IDOR residual. NOT serialized into the audit
   * payload by the pack (the store/identity are host infra, not charge state).
   */
  readonly authority?: PixAuthorityContext;
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
 *
 * Encoded via `createSystemTaintPolicy` (Layer-2 primitive) so the
 * "system-only kind" pattern carries its name into the source, and the
 * allowlist is the one-line audit surface for "what kinds can the LLM
 * not propose?"
 */
export const pixTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["pix.charge.confirm"],
});

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
