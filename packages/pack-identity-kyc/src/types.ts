/**
 * pack-identity-kyc — domain types.
 *
 * Splitting types out of `policy.ts` (the convention pack-payments-pix
 * also follows). Keeps the policy file focused on guards + planner +
 * taint, and makes types reusable from tests + adopter integration code
 * without dragging in the full PolicyBundle.
 *
 * The KYC domain models a state machine, NOT atomic transactions:
 *
 *   INIT
 *     ↓ kyc.start                   → DEFER (signal: kyc.documents.uploaded)
 *   DOCS_REQUIRED
 *     ↓ kyc.document.upload         → DEFER (signal: kyc.vendor.completed)
 *   VENDOR_PENDING
 *     ↓ kyc.vendor.callback (CLEAR + high score)  → EXECUTE
 *     ↓ kyc.vendor.callback (FLAGGED)             → ESCALATE
 *     ↓ kyc.vendor.callback (low score)           → REFUSE
 *   VERIFIED / MANUAL_REVIEW / REJECTED
 *
 * Each transition is driven by a separate intent. The kernel's DEFER
 * outcome + the runtime's signal-based resume complete the loop.
 */

// ─── Intent kinds ──────────────────────────────────────────────────────────

export type IdentityKycIntentKind =
  | "kyc.start"
  | "kyc.document.upload"
  | "kyc.vendor.callback";

// ─── Domain primitives ─────────────────────────────────────────────────────

export type DocumentType = "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID";
export type DocumentStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface Document {
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly uploadedAt: string;
}

export type AmlStatus = "CLEAR" | "FLAGGED";

export type KycSessionStatus =
  | "INIT"
  | "DOCS_REQUIRED"
  | "VENDOR_PENDING"
  | "MANUAL_REVIEW"
  | "VERIFIED"
  | "REJECTED";

export interface VendorVerificationResult {
  /** 0–100 confidence the identity is genuine. */
  readonly score: number;
  readonly amlStatus: AmlStatus;
  /** When AML flagged: % match against the watchlist entry. */
  readonly amlMatchScore?: number;
  /** When AML flagged: the watchlist entry name (for operator review). */
  readonly amlMatchEntity?: string;
  readonly receivedAt: string;
}

export interface KycSession {
  readonly id: string;
  readonly userId: string;
  readonly status: KycSessionStatus;
  readonly documents: readonly Document[];
  readonly verification?: VendorVerificationResult;
  readonly createdAt: string;
}

// ─── State + Context shapes ────────────────────────────────────────────────

export interface IdentityKycState {
  /** Active KYC sessions keyed by sessionId. */
  readonly sessions: ReadonlyMap<string, KycSession>;
}

export interface IdentityKycContext {
  readonly tenantId: string;
}

// ─── Payload types per intent ──────────────────────────────────────────────

export interface KycStartPayload {
  readonly sessionId: string;
  readonly userId: string;
}

export interface KycDocumentUploadPayload {
  readonly sessionId: string;
  readonly documentType: DocumentType;
  readonly documentRef: string;
}

export interface KycVendorCallbackPayload {
  readonly sessionId: string;
  /** 0–100 confidence the identity is genuine. */
  readonly score: number;
  readonly amlStatus: AmlStatus;
  readonly amlMatchScore?: number;
  readonly amlMatchEntity?: string;
}

/** Discriminated union over all valid KYC payloads. */
export type IdentityKycPayload =
  | KycStartPayload
  | KycDocumentUploadPayload
  | KycVendorCallbackPayload;

// ─── DEFER signal vocabulary ───────────────────────────────────────────────
// The kernel's runtime parks the deferred intent until one of these
// signals fires. The signal name is the contract between policy +
// runtime + adopter wiring (e.g., a webhook handler emits
// "kyc.vendor.completed" when the vendor's callback arrives).

export const KYC_DOCUMENTS_UPLOADED_SIGNAL = "kyc.documents.uploaded" as const;
export const KYC_VENDOR_COMPLETED_SIGNAL = "kyc.vendor.completed" as const;

export type KycDeferSignal =
  | typeof KYC_DOCUMENTS_UPLOADED_SIGNAL
  | typeof KYC_VENDOR_COMPLETED_SIGNAL;

// ─── Policy thresholds ─────────────────────────────────────────────────────

/** Verification score below this → REFUSE. */
export const KYC_REFUSE_THRESHOLD = 50;
/** Verification score at or above this (with no AML flag) → EXECUTE. */
export const KYC_EXECUTE_THRESHOLD = 90;
/** Document upload deadline — runtime expires the DEFER if user doesn't upload in time. */
export const KYC_DOCUMENT_UPLOAD_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Vendor verification deadline. */
export const KYC_VENDOR_TIMEOUT_MS = 30 * 60 * 1000;
