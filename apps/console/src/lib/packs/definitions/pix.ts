import { installPack } from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import type { ConsolePackAdapter } from "../adapter";

/**
 * Console adapter for `@adjudicate/pack-payments-pix`.
 *
 * Synthesizes a `PixState` — `{ charges: Map<id, PixCharge> }` — from
 * the record's payload. For records that reference a `chargeId`, we
 * fabricate a "confirmed" charge with an amount inferred from the
 * payload. This lets refund guards (clamp-to-original,
 * threshold-escalation) evaluate against a plausible value rather
 * than fail on missing-charge.
 *
 * The synthesis is deterministic: same record, same state. A replay
 * that "reproduces" is meaningful — under THIS state, the policy
 * produces this decision.
 */

const { pack } = installPack(paymentsPixPack);

interface PixPayloadShape {
  chargeId?: string;
  amountCentavos?: number;
  refundCentavos?: number;
}

export const pixAdapter: ConsolePackAdapter = {
  pack,
  displayName: "Payments PIX",
  async getSyntheticState(record: AuditRecord) {
    const payload = (record.envelope.payload ?? {}) as PixPayloadShape;
    const charges = new Map<string, unknown>();

    if (typeof payload.chargeId === "string") {
      const amountCentavos =
        payload.amountCentavos ?? payload.refundCentavos ?? 30_000;
      charges.set(payload.chargeId, {
        id: payload.chargeId,
        amountCentavos,
        status: "confirmed",
        createdAt: record.envelope.createdAt,
        confirmedAt: record.envelope.createdAt,
      });
    }

    return { charges };
  },
};
