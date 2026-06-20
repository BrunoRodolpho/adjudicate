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

import type { AuthorityGraphStore } from "@adjudicate/core";

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

/**
 * 201 — OPTIONAL injected authority context (032/033/034), mirroring
 * `PixAuthorityContext`. When the host injects it, the authority guard in
 * `authGuards` is BINDING for the mutating UNTRUSTED-min kinds `kyc.start` /
 * `kyc.document.upload`; when absent the guard is inert (pre-201 demo posture).
 *
 * This is the SUBSTANTIVE §D #8 close (035-F1): before 201 a forged/unbound/
 * impersonated owner of a `kyc.start`/`kyc.document.upload` intent passed the
 * (empty) auth slot and landed on the unconditional business DEFER guards ⇒
 * DEFER. Wiring this guard (auth phase runs BEFORE business) makes a forged owner
 * REFUSE at the auth phase, short-circuiting before the business DEFER ⇒ the
 * outcome flips DEFER → REFUSE.
 *
 * Host-injection contract for kyc: the `resource` an envelope's
 * `resourceRefs.resource` names is the KYC session's `userId` (the subject whose
 * identity is being verified — the payload carries `sessionId`/`userId`), and
 * `resourceRefs.owner` is the principal the host's authority graph binds to that
 * user. The AUTHENTICATED principal comes from
 * `state.authority.principalOf(actor.sessionId)`.
 *
 * ⚠️ IDOR residual (034-F1/F2). `principalOf` is the seam that actually closes
 * IDOR. The host MUST resolve the AUTHENTICATED acting principal from a trusted
 * session→identity map keyed by `actor.sessionId` — NEVER from
 * `resourceRefs.owner` (attacker-controlled) — and its namespace MUST match the
 * authority-graph principal names. WITHOUT `principalOf`, the guard fails CLOSED
 * (REFUSE) rather than falling back to bare declared-owner binding.
 */
export interface KycAuthorityContext {
  /** The injected authority-graph snapshot store (032/033). */
  readonly store: AuthorityGraphStore;
  /**
   * IDOR-closing host-identity seam. Resolves the AUTHENTICATED acting principal
   * from `actor.sessionId` (a trusted host session→identity map) — NEVER from
   * `resourceRefs.owner`. Return `null` for an unauthenticated/unknown session
   * (the guard then REFUSEs, fail-closed). Omit only when the host has no
   * identity model AND accepts the documented IDOR residual.
   */
  readonly principalOf?: (sessionId: string) => string | null;
}

export interface IdentityKycState {
  /** Active KYC sessions keyed by sessionId. */
  readonly sessions: ReadonlyMap<string, KycSession>;
  /**
   * 201 — OPTIONAL injected authority context (032/033/034). When present, the
   * authority guard in `authGuards` is binding for the mutating UNTRUSTED-min
   * kinds (`kyc.start` / `kyc.document.upload`); when absent the guard is inert.
   * See `KycAuthorityContext` for the IDOR residual. NOT serialized by
   * `rehydrateKycState` (the store / identity are host infra, not session state)
   * → never enters the audit/replay hash (invariant #4/#5 safe).
   */
  readonly authority?: KycAuthorityContext;
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
  /**
   * Sanctions/OFAC watchlist match confidence (0–100). A VALIDATED escalate
   * signal (102): when `amlMatchScore >= KYC_SANCTIONS_MATCH_THRESHOLD` the
   * `escalateOnSanctionsMatchScore` guard ESCALATEs even if `amlStatus` is not
   * `"FLAGGED"` — closing the "never compared, only decoration" gap. Optional:
   * a FLAGGED callback with no match score still escalates via the standalone
   * `escalateOnAmlFlag` flag check (the UNION's score-independent branch).
   */
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
/**
 * Sanctions/OFAC watchlist match confidence at or above this → ESCALATE (102).
 * Grounds `amlMatchScore` (previously never compared) as the validated,
 * range-checked second branch of the escalate-only AML UNION. Escalate-only:
 * the sanctions signal can only raise friction to a human, never authorize
 * EXECUTE and never waive a downstream gate (§C monotonicity, inv. 7). Set at
 * 80 so a strong watchlist correlation escalates for human review even when
 * the vendor did not set the hard `amlStatus: "FLAGGED"` flag.
 */
export const KYC_SANCTIONS_MATCH_THRESHOLD = 80;
/** Document upload deadline — runtime expires the DEFER if user doesn't upload in time. */
export const KYC_DOCUMENT_UPLOAD_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Vendor verification deadline. */
export const KYC_VENDOR_TIMEOUT_MS = 30 * 60 * 1000;
