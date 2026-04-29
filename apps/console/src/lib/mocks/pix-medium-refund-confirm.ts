import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRequestConfirmation,
  type AuditRecord,
} from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ7MIDD",
    refundCentavos: 64_000,
    reason: "customer dissatisfaction",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_e211c6" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T18:47:11_e211c6",
  createdAt: "2026-04-28T18:47:11.000Z",
});

const decision = decisionRequestConfirmation(
  "Confirme o reembolso de R$ 640,00 para o pagamento PIX cha_01HXYZ7MIDD?",
  [
    basis("business", "rule_satisfied", {
      threshold: 50_000,
      requested: 64_000,
      requires: "explicit_confirmation",
    }),
  ],
);

export const pixMediumRefundConfirm: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 26,
  at: "2026-04-28T18:47:11.026Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
    forbiddenConcepts: [],
  },
});
