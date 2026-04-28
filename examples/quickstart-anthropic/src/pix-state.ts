/**
 * In-memory PixState fixtures + state-transition helpers for the demo.
 *
 * The transcript driver mutates state between turns to demonstrate that
 * the planner re-evaluates per turn (e.g., after Turn 1 confirms, refund
 * tools become visible).
 */

import type { PixCharge, PixState } from "@adjudicate/pack-payments-pix";

/**
 * Initial demo state — empty. The first turn will create a charge and
 * (after the simulated webhook) we transition it to confirmed.
 */
export function createInitialDemoState(): PixState {
  return { charges: new Map<string, PixCharge>() };
}

/**
 * Pre-baked state with three confirmed charges of varying amounts. Used
 * after Turn 1 (which establishes a charge) to make Turns 2-6 actually
 * have refundable charges referenced by the scripted user messages.
 *
 * Charge ids are predictable strings so the scripted user messages can
 * mention them by id.
 */
export function createPrimedDemoState(): PixState {
  const now = new Date().toISOString();
  const charges = new Map<string, PixCharge>([
    [
      "cha-confirmed-low",
      {
        id: "cha-confirmed-low",
        amountCentavos: 5000, // R$ 50
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      },
    ],
    [
      "cha-confirmed-mid",
      {
        id: "cha-confirmed-mid",
        amountCentavos: 80_000, // R$ 800
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      },
    ],
    [
      "cha-confirmed-high",
      {
        id: "cha-confirmed-high",
        amountCentavos: 300_000, // R$ 3,000
        status: "confirmed",
        createdAt: now,
        confirmedAt: now,
      },
    ],
  ]);
  return { charges };
}

/**
 * Mark a charge as refunded. Called after the executor runs a refund
 * intent so subsequent turns see updated state.
 */
export function applyRefund(
  state: PixState,
  chargeId: string,
  refundedCentavos: number,
): PixState {
  const existing = state.charges.get(chargeId);
  if (existing === undefined) return state;
  const charges = new Map(state.charges);
  charges.set(chargeId, {
    ...existing,
    status: "refunded",
    refundedAt: new Date().toISOString(),
    refundedCentavos,
  });
  return { charges };
}
