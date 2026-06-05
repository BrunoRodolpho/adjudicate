/**
 * SecurityReviewer-018 — the in-memory `pix.charge.create` handler must NOT
 * embed `payerDocument` (CPF) in the qrCode (or any field) returned to the
 * LLM context. The qrCode references the opaque charge ID instead.
 */

import { describe, expect, it } from "vitest";
import { inMemoryPixHandlers } from "../src/handlers.js";
import type { PixChargeCreatePayload } from "../src/types.js";

describe("inMemoryPixHandlers — pix.charge.create PII (SecurityReviewer-018)", () => {
  const payload: PixChargeCreatePayload = {
    amountCentavos: 12345,
    payerDocument: "11144477735", // CPF — must never leak into output
    description: "rent",
  };

  it("does not embed the payer CPF in the qrCode", async () => {
    const result = (await inMemoryPixHandlers["pix.charge.create"](
      payload,
    )) as { chargeId: string; amountCentavos: number; qrCode: string; status: string };

    // The CPF must not appear anywhere in the returned qrCode.
    expect(result.qrCode).not.toContain(payload.payerDocument);
    // Defensive: no 11-digit CPF-shaped run (dotted or plain) in the qrCode.
    expect(result.qrCode).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  });

  it("references the opaque chargeId in the qrCode and preserves return shape", async () => {
    const result = (await inMemoryPixHandlers["pix.charge.create"](
      payload,
    )) as { chargeId: string; amountCentavos: number; qrCode: string; status: string };

    expect(result.qrCode).toBe(`pix-qr-${result.chargeId}-${payload.amountCentavos}`);
    // Return shape unchanged: chargeId, amountCentavos, qrCode, status all present.
    expect(result.chargeId).toMatch(/^cha-/);
    expect(result.amountCentavos).toBe(payload.amountCentavos);
    expect(result.status).toBe("pending");
  });
});
