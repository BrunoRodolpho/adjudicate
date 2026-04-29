import type { PackV0 } from "@adjudicate/core";
import { planner, policy } from "./policy.js";
import type {
  IdentityKycContext,
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState,
} from "./types.js";

/**
 * pack-identity-kyc — adjudicate Pack #3.
 *
 * Validates the framework's **asynchronous** outcomes (DEFER + ESCALATE)
 * in a way `pack-payments-pix` doesn't fully exercise. KYC is a state
 * machine: each user-initiated intent DEFERs until an external signal
 * (document upload, vendor verification webhook) arrives, at which
 * point the kernel produces the terminal Decision.
 *
 * Lifecycle:
 *
 *   kyc.start           → DEFER (signal: kyc.documents.uploaded, 24h)
 *   kyc.document.upload → DEFER (signal: kyc.vendor.completed, 30m)
 *   kyc.vendor.callback → EXECUTE | ESCALATE | REFUSE
 *
 * The vendor callback intent is intentionally NOT exposed to the LLM
 * (`forbiddenConcepts` in the planner). It's system-trusted; only the
 * adopter's webhook handler should construct envelopes of that kind.
 *
 * Generated via `adjudicate pack init pack-identity-kyc` (Phase 3a)
 * and customized for the KYC domain (Phase 3b). The split between
 * `index.ts` (Pack metadata), `policy.ts` (guards + planner + taint),
 * and `types.ts` (domain shapes) is the canonical layout —
 * `pack-payments-pix` follows the same pattern.
 */
export const IdentityKycPack = {
  id: "pack-identity-kyc",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: [
    "kyc.start",
    "kyc.document.upload",
    "kyc.vendor.callback",
  ],
  policy,
  planner,
  basisCodes: [
    // Refusal taxonomy (Refusal.code) the policy may emit.
    "kyc.verification_score_too_low",
  ],
  signals: [
    // DEFER signals the policy emits. The runtime parks intents on these
    // signals; the adopter's webhook/upload-handler emits them.
    "kyc.documents.uploaded",
    "kyc.vendor.completed",
  ],
} as const satisfies PackV0<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState,
  IdentityKycContext
>;

export type {
  AmlStatus,
  Document,
  DocumentStatus,
  DocumentType,
  IdentityKycContext,
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState,
  KycDeferSignal,
  KycDocumentUploadPayload,
  KycSession,
  KycSessionStatus,
  KycStartPayload,
  KycVendorCallbackPayload,
  VendorVerificationResult,
} from "./types.js";

export {
  KYC_DOCUMENT_UPLOAD_TIMEOUT_MS,
  KYC_DOCUMENTS_UPLOADED_SIGNAL,
  KYC_EXECUTE_THRESHOLD,
  KYC_REFUSE_THRESHOLD,
  KYC_VENDOR_COMPLETED_SIGNAL,
  KYC_VENDOR_TIMEOUT_MS,
} from "./types.js";
