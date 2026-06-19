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
import type {
  PixCharge,
  PixContext,
  PixIntentKind,
  PixState,
} from "./types.js";

/**
 * Reconstitute a `PixState` from a JSON-serializable representation.
 *
 * The runtime state uses `Map<string, PixCharge>` for `charges`, which
 * doesn't survive `JSON.stringify`. Tools that read state from JSON
 * (scenario fixtures for `adjudicate simulate`, audit replay payloads,
 * future Console scenario builder) call this to convert
 * `{ charges: { [id]: PixCharge } }` back into the Map shape the
 * policy's guards expect.
 *
 * Permissive on input: silently tolerates already-rehydrated states
 * (idempotent), and treats absent/malformed fields as empty maps.
 * That's appropriate for a scenario boundary — the policy's guards
 * are the authoritative validators of the rehydrated state.
 */
export function rehydratePixState(raw: unknown): PixState {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "charges" in raw
  ) {
    const charges = (raw as { charges: unknown }).charges;
    if (charges instanceof Map) {
      return { charges: charges as ReadonlyMap<string, PixCharge> };
    }
    if (typeof charges === "object" && charges !== null) {
      return {
        charges: new Map(
          Object.entries(charges as Record<string, PixCharge>),
        ),
      };
    }
  }
  return { charges: new Map() };
}

// Re-exports for adopters.
export {
  PIX_CONFIRMATION_SIGNAL,
  PIX_CONFIRMED_STATUSES,
  PIX_DEFAULT_DEFER_TIMEOUT_MS,
  PIX_DEFAULT_EXPIRY_SECONDS,
  pixTaintPolicy,
  type PixAuthorityContext,
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

export {
  PIX_BUDGET_CAPABLE_INTENTS,
  PIX_TOOLS,
  pixCapabilityPlanner,
} from "./capabilities.js";

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
  /**
   * Wire signals this Pack parks on via DEFER. Declared so the analyzer
   * (AJD-102) can cross-check `state_defer` guard metadata against the
   * Pack-level surface — and so the Operator Console / replay harness can
   * enumerate the async lifecycle this Pack participates in.
   */
  signals: ["payment.confirmed"],
  handlers: inMemoryPixHandlers,
  /**
   * Scenario-state rehydrator. CLI `simulate` and other JSON-driven
   * tools call this to convert plain-object state into the runtime
   * Map shape. See `rehydratePixState` for semantics.
   */
  rehydrateState: rehydratePixState,
} as const satisfies PackV0<PixIntentKind, unknown, PixState, PixContext>;
