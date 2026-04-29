import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRewrite,
  type AuditRecord,
} from "@adjudicate/core";

const originalEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ6OVRSHT",
    refundCentavos: 95_000, // overshoots original of 30_000
    reason: "full refund",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_f9921b" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T18:21:33_f9921b",
  createdAt: "2026-04-28T18:21:33.000Z",
});

// REWRITE substitutes a sanitized envelope. Same nonce + actor + taint —
// it's the same logical action, just clamped to a safe quantity.
const rewrittenEnvelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ6OVRSHT",
    refundCentavos: 30_000, // clamped to original charge total
    reason: "full refund",
  },
  actor: originalEnvelope.actor,
  taint: originalEnvelope.taint,
  nonce: originalEnvelope.nonce,
  createdAt: originalEnvelope.createdAt,
});

const decision = decisionRewrite(
  rewrittenEnvelope,
  "Refund amount clamped to the original charge total (R$ 300,00).",
  [
    basis("business", "quantity_capped", {
      requested: 95_000,
      clampedTo: 30_000,
    }),
  ],
);

export const pixOvershootRefundRewrite: AuditRecord = buildAuditRecord({
  envelope: originalEnvelope,
  decision,
  durationMs: 19,
  at: "2026-04-28T18:21:33.019Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
    forbiddenConcepts: [],
  },
});
