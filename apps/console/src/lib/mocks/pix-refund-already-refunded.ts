import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionRefuse,
  refuse,
  type AuditRecord,
} from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ8ABCDEF",
    refundCentavos: 30_000,
    reason: "customer requested",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_a31f7e" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:31:19_a31f7e",
  createdAt: "2026-04-28T20:31:19.000Z",
});

const decision = decisionRefuse(
  refuse(
    "STATE",
    "pix.charge.already_refunded",
    "We've already processed a refund for this charge.",
    "chargeId=cha_01HXYZ8ABCDEF",
  ),
  [
    basis("state", "transition_illegal", { reason: "already_refunded" }),
    basis("state", "terminal_state"),
  ],
);

export const pixRefundAlreadyRefunded: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 47,
  resourceVersion: "ord_v3",
  at: "2026-04-28T20:31:19.047Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
    forbiddenConcepts: [],
  },
});
