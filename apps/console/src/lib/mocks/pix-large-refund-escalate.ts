import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionEscalate,
  type AuditRecord,
} from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ9LARGE",
    refundCentavos: 215_000,
    reason: "high-value dispute resolution",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_d44a91" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T19:32:45_d44a91",
  createdAt: "2026-04-28T19:32:45.000Z",
});

const decision = decisionEscalate(
  "supervisor",
  "Refund of R$ 2150,00 exceeds R$ 1000,00 supervisor threshold",
  [
    basis("business", "rule_violated", {
      threshold: 100_000,
      requested: 215_000,
    }),
  ],
);

export const pixLargeRefundEscalate: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 38,
  at: "2026-04-28T19:32:45.038Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
    forbiddenConcepts: [],
  },
});
