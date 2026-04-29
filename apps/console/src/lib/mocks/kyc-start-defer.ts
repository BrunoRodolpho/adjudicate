import {
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionDefer,
  type AuditRecord,
} from "@adjudicate/core";

/**
 * Phase 4 fixture — proves the multi-Pack registry routes a `kyc.start`
 * record to the KYC adapter and produces the expected DEFER outcome
 * when the operator clicks Replay.
 *
 * Mirrors the PIX defer fixture's shape so the table renders both
 * Packs uniformly. The DEFER timeout (24h) and signal name match the
 * KYC pack's `KYC_DOCUMENTS_UPLOADED_SIGNAL` / `KYC_DOCUMENT_UPLOAD_TIMEOUT_MS`.
 */

const envelope = buildEnvelope({
  kind: "kyc.start",
  payload: {
    sessionId: "kyc_sess_01HXYZ_NEW_USER",
    userId: "user_01HXYZ_2026_04_28",
  },
  actor: { principal: "llm", sessionId: "sess_2026-04-28_kyc_a14b22" },
  taint: "UNTRUSTED",
  nonce: "n_2026-04-28T20:12:08_kyc_a14b22",
  createdAt: "2026-04-28T20:12:08.000Z",
});

const decision = decisionDefer(
  "kyc.documents.uploaded",
  24 * 60 * 60 * 1000, // 24h, matches KYC_DOCUMENT_UPLOAD_TIMEOUT_MS
  [
    basis("state", "transition_valid", {
      reason: "documents_required",
      transition: "INIT→DOCS_REQUIRED",
    }),
  ],
);

export const kycStartDefer: AuditRecord = buildAuditRecord({
  envelope,
  decision,
  durationMs: 14,
  at: "2026-04-28T20:12:08.014Z",
  plan: {
    visibleReadTools: ["list_kyc_sessions", "get_kyc_session"],
    allowedIntents: ["kyc.start"],
    forbiddenConcepts: ["kyc.vendor.callback"],
  },
});
