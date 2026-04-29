import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  type AuditRecord,
} from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "pix.charge.refund",
  payload: {
    chargeId: "cha_01HXYZ4QRSTUV",
    refundCentavos: 18_500,
    reason: "duplicate charge",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_b1429f" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:18:02_b1429f",
  createdAt: "2026-04-28T20:18:02.000Z",
});

const decision = decisionExecute([
  basis("state", "transition_valid"),
  basis("auth", "scope_sufficient"),
  basis("taint", "level_permitted"),
  basis("business", "rule_satisfied", { ruleId: "refund_within_thresholds" }),
]);

export const pixRefundExecute: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 31,
  resourceVersion: "ord_v8",
  at: "2026-04-28T20:18:02.031Z",
  plan: {
    visibleReadTools: ["list_pix_charges", "get_pix_charge"],
    allowedIntents: ["pix.charge.refund"],
    forbiddenConcepts: [],
  },
});
