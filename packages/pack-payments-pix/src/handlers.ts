/**
 * @adjudicate/pack-payments-pix — in-memory tool handlers for tests + demos.
 *
 * Real adopters wire their own provider client (Mercado Pago, Stripe Brazil,
 * Cielo, etc.) into handlers shaped like this. The Pack ships these
 * in-memory handlers so the test suite and the smoke demo run without
 * external dependencies — they're not for production.
 *
 * Phase 2's `@adjudicate/tools` (when it lands) will wrap handlers in
 * versioned, schema-defined, signed `ToolDefinition` objects. PackV0
 * doesn't require that yet.
 *
 * LGPD / PII note: real PIX implementations receive `payerDocument` (CPF).
 * Do NOT embed CPF in the qrCode or any string returned to the LLM context —
 * it will persist in model history, provider logs, and audit records. Use an
 * opaque charge ID or a provider-generated token as the QR code reference.
 */

import type { PackHandler } from "@adjudicate/core";
import type {
  PixChargeConfirmPayload,
  PixChargeCreatePayload,
  PixChargeRefundPayload,
  PixIntentKind,
  PixState,
} from "./types.js";

export const inMemoryPixHandlers: Readonly<
  Record<PixIntentKind, PackHandler<unknown, PixState>>
> = {
  "pix.charge.create": async (payload) => {
    const p = payload as PixChargeCreatePayload;
    const chargeId = `cha-${Date.now().toString(36)}`;
    return {
      chargeId,
      amountCentavos: p.amountCentavos,
      // SecurityReviewer-018: qrCode must NOT embed payerDocument (CPF) — it
      // bubbles into LLM context, provider logs, and audit records. Use the
      // opaque charge ID as the QR reference instead.
      qrCode: `pix-qr-${chargeId}-${p.amountCentavos}`,
      status: "pending" as const,
    };
  },
  "pix.charge.confirm": async (payload) => {
    const p = payload as PixChargeConfirmPayload;
    return {
      chargeId: p.chargeId,
      providerTxId: p.providerTxId,
      confirmedAt: p.confirmedAt,
      status: "confirmed" as const,
    };
  },
  "pix.charge.refund": async (payload) => {
    const p = payload as PixChargeRefundPayload;
    return {
      chargeId: p.chargeId,
      refundCentavos: p.refundCentavos,
      reason: p.reason,
      refundedAt: new Date().toISOString(),
      status: "refunded" as const,
    };
  },
};
