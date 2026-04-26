/**
 * @adjudicate/pack-payments-pix — lighthouse Pack for the adjudicate platform.
 *
 * Phase 1 scaffold: PackV0 conformance + domain types only. Real PolicyBundle
 * guards (REWRITE on refund > original, DEFER on charge.create awaiting the
 * webhook signal, REFUSE on charge-not-found / already-refunded), the full
 * CapabilityPlanner, RefusalTaxonomy, handlers, and six-outcome tests land
 * in the next iteration. This skeleton exists so consumers can import the
 * Pack shape today and so the conformance test gates the contract.
 */

import { staticPlanner, type PackV0, type PolicyBundle } from "@adjudicate/core";

import {
  PIX_CHARGE_CONFIRMED_SIGNAL,
  PIX_CHARGE_DEFER_TIMEOUT_MS,
  pixTaintPolicy,
  type PixContext,
  type PixIntentKind,
  type PixState,
} from "./types.js";

export {
  PIX_CHARGE_CONFIRMED_SIGNAL,
  PIX_CHARGE_DEFER_TIMEOUT_MS,
  pixTaintPolicy,
  type PixCharge,
  type PixChargeConfirmPayload,
  type PixChargeCreatePayload,
  type PixChargeRefundPayload,
  type PixChargeStatus,
  type PixContext,
  type PixIntentKind,
  type PixState,
} from "./types.js";

/**
 * Scaffold PolicyBundle — empty guard arrays + REFUSE default. Every
 * intent currently falls through to `default_deny`. The next iteration
 * fills `stateGuards` with state-machine checks, `business` with
 * REWRITE-on-refund-cap and DEFER-on-create, and `authGuards` with
 * customer-merchant ownership checks.
 */
const pixPolicyBundle: PolicyBundle<PixIntentKind, unknown, PixState> = {
  stateGuards: [],
  authGuards: [],
  taint: pixTaintPolicy,
  business: [],
  default: "REFUSE",
};

/**
 * Scaffold CapabilityPlanner — declares the LLM-proposable intent kinds
 * (`create`, `refund`); `confirm` is webhook-only and never visible to
 * the LLM. Real planner will gate visibility per state (e.g., `refund`
 * only when there's a confirmed charge).
 */
const pixCapabilityPlanner = staticPlanner<PixState, PixContext>({
  visibleReadTools: [],
  allowedIntents: ["pix.charge.create", "pix.charge.refund"],
  forbiddenConcepts: [],
});

/**
 * Basis codes the Pack's policy will emit. Declared upfront so Phase 6's
 * AaC review can validate that runtime emissions stay within this set.
 *
 * The scaffold lists what the next iteration's guards will produce; today
 * only `default_deny` (from `BASIS_CODES.business`) actually fires.
 */
const pixBasisCodes = [
  "pix.charge.created",
  "pix.charge.deferred_for_confirmation",
  "pix.charge.confirmed",
  "pix.charge.refunded",
  "pix.charge.refund_clamped_to_original",
  "pix.charge.not_found",
  "pix.charge.not_confirmed",
  "pix.charge.already_refunded",
  "pix.charge.amount_invalid",
] as const;

/**
 * The Pack — exported as the package's default-shape value. Conforms to
 * `PackV0<PixIntentKind, unknown, PixState, PixContext>` via `satisfies`,
 * which gives compile-time conformance without widening the literal types
 * (so `paymentsPixPack.intents` stays typed as the literal tuple).
 */
export const paymentsPixPack = {
  id: "pack-payments-pix",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: [
    "pix.charge.create",
    "pix.charge.confirm",
    "pix.charge.refund",
  ],
  policy: pixPolicyBundle,
  planner: pixCapabilityPlanner,
  basisCodes: pixBasisCodes,
} as const satisfies PackV0<PixIntentKind, unknown, PixState, PixContext>;
