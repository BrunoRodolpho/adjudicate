/**
 * @adjudicate/pack-payments-pix — lighthouse Pack for the adjudicate platform.
 *
 * Async PIX payment lifecycle that exercises all six Decision outcomes:
 * REWRITE (refund cap), DEFER (awaiting webhook), ESCALATE (large refund OR
 * confirm-on-failed), REQUEST_CONFIRMATION (medium refund), REFUSE (charge-
 * not-found / not-confirmed / already-refunded / amount-invalid), and
 * EXECUTE (valid confirm or small refund).
 *
 * Two adoption patterns:
 *
 *   1. Greenfield (canonical-Pack-intent): import `paymentsPixPack`,
 *      dispatch envelopes against `paymentsPixPack.policy`. The Pack's
 *      intent kinds (`pix.charge.{create,confirm,refund}`) are the wire
 *      contract.
 *
 *   2. Existing intent kind (factory pattern): import
 *      `createPixPendingDeferGuard`, compose into your own PolicyBundle
 *      against your own intent kind. Canonical example: IbateXas's
 *      `@ibatexas/llm-provider`'s `order-policy-bundle.ts` composes the
 *      factory against `order.confirm`.
 *
 * Conformance: `paymentsPixPack satisfies PackV0<...>`. See README and
 * `docs/runbook.md` for adoption guidance.
 */

import type { PackV0 } from "@adjudicate/core";
import { pixCapabilityPlanner } from "./capabilities.js";
import { inMemoryPixHandlers } from "./handlers.js";
import { pixPolicyBundle } from "./policies.js";
import type { PixContext, PixIntentKind, PixState } from "./types.js";

// Re-exports for adopters.
export {
  PIX_CONFIRMATION_SIGNAL,
  PIX_CONFIRMED_STATUSES,
  PIX_DEFAULT_DEFER_TIMEOUT_MS,
  PIX_DEFAULT_EXPIRY_SECONDS,
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

export {
  refuseChargeAlreadyRefunded,
  refuseChargeExpired,
  refuseChargeFailed,
  refuseChargeNotConfirmed,
  refuseChargeNotFound,
  refuseConfirmRequiresWebhook,
  refuseInvalidAmount,
  refuseInvalidStateForConfirm,
  refuseRateLimitExceeded,
} from "./refusals.js";

export {
  CONFIRM_REFUND_THRESHOLD_CENTAVOS,
  ESCALATE_REFUND_THRESHOLD_CENTAVOS,
  pixPolicyBundle,
} from "./policies.js";

export { PIX_TOOLS, pixCapabilityPlanner } from "./capabilities.js";

export { inMemoryPixHandlers } from "./handlers.js";

export {
  createPixPendingDeferGuard,
  type PixPendingDeferGuardOptions,
} from "./guards.js";

/**
 * The Pack as a PackV0-conformant value. `satisfies` gives compile-time
 * conformance without widening literal types — `paymentsPixPack.intents`
 * stays typed as the literal tuple.
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
  /**
   * Refusal codes the Pack's policy may emit (free-form, dotted convention).
   * Phase 6 AaC review verifies that runtime emissions stay inside this set.
   */
  basisCodes: [
    "pix.charge.not_found",
    "pix.charge.not_confirmed",
    "pix.charge.already_refunded",
    "pix.charge.invalid_state_for_confirm",
    "pix.charge.amount_invalid",
    "pix.charge.expired",
    "pix.charge.failed",
    "pix.charge.rate_limit_exceeded",
    "pix.charge.confirm_requires_webhook",
  ],
  handlers: inMemoryPixHandlers,
} as const satisfies PackV0<PixIntentKind, unknown, PixState, PixContext>;
