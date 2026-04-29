import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionDefer,
  type AuditRecord,
} from "@adjudicate/core";

const envelope = buildEnvelope({
  kind: "pix.charge.create",
  payload: {
    amountCentavos: 45_900,
    description: "Order #2914 — express delivery",
    customerId: "cust_01HXYZAA",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_c882d1" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T19:55:14_c882d1",
  createdAt: "2026-04-28T19:55:14.000Z",
});

const decision = decisionDefer(
  "payment.confirmed",
  15 * 60_000, // 15 min
  [basis("state", "transition_valid", { transition: "create→pending" })],
);

export const pixChargeCreateDefer: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 22,
  at: "2026-04-28T19:55:14.022Z",
  plan: {
    visibleReadTools: ["list_pix_charges"],
    allowedIntents: ["pix.charge.create"],
    forbiddenConcepts: ["confirm-without-webhook"],
  },
});
