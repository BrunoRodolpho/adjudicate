import {
  basis,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  refuse,
  type Guard,
  type PolicyBundle,
} from "@adjudicate/core";
import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type ToolClassification,
} from "@adjudicate/core/llm";
import {
  createStateDeferGuard,
  createSystemTaintPolicy,
  createThresholdGuard,
} from "@adjudicate/primitives";
import {
  KYC_DOCUMENT_UPLOAD_TIMEOUT_MS,
  KYC_DOCUMENTS_UPLOADED_SIGNAL,
  KYC_EXECUTE_THRESHOLD,
  KYC_REFUSE_THRESHOLD,
  KYC_VENDOR_COMPLETED_SIGNAL,
  KYC_VENDOR_TIMEOUT_MS,
  type IdentityKycContext,
  type IdentityKycIntentKind,
  type IdentityKycPayload,
  type IdentityKycState,
  type KycVendorCallbackPayload,
} from "./types.js";

/**
 * pack-identity-kyc — policy.
 *
 * The KYC domain demonstrates the framework's **asynchronous** outcomes
 * (DEFER + ESCALATE) in a way pack-payments-pix doesn't fully exercise.
 * Where PIX is "request → adjudicate → execute," KYC is a multi-stage
 * state machine where each user-initiated adjudication call returns a
 * DEFER until an external signal (document upload completed, vendor
 * webhook arrived) at which point the kernel produces the terminal
 * Decision (EXECUTE / REFUSE / ESCALATE).
 *
 * Guard ordering (within `business`) — kernel evaluates in declaration
 * order, first non-null wins:
 *
 *   1. requireDocumentUpload   — kyc.start always DEFERs for documents
 *   2. waitForVerification     — kyc.document.upload always DEFERs for vendor
 *   3. escalateOnAmlFlag       — kyc.vendor.callback ESCALATEs if FLAGGED
 *   4. refuseLowScore          — kyc.vendor.callback REFUSEs if score < 50
 *   5. executeOnHighScore      — kyc.vendor.callback EXECUTEs if score ≥ 90
 *
 * Borderline (50 ≤ score < 90, CLEAR) falls through to `default: "REFUSE"`
 * — conservative-by-default. Adopters can add a REQUEST_CONFIRMATION
 * guard for that range when their compliance team permits.
 *
 * Layer-2 primitives in use (Phase 5 refactor):
 *   - `createStateDeferGuard`     drives requireDocumentUpload + waitForVerification
 *   - `createThresholdGuard`      drives refuseLowScore + executeOnHighScore
 *   - `createSystemTaintPolicy`   declares kyc.vendor.callback as system-only
 */

// ─── Tool classification ───────────────────────────────────────────────────

const KYC_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_kyc_sessions", "get_kyc_session"]),
  MUTATING: new Set(["start_kyc", "upload_document"]),
};

// ─── Capability planner ────────────────────────────────────────────────────
//
// State-aware: `start_kyc` is visible only when no active session
// exists; `upload_document` is visible only when a session is in
// DOCS_REQUIRED. The vendor callback intent is in `forbiddenConcepts`
// — the LLM must NEVER propose a vendor verification result.

const rawPlanner: CapabilityPlanner<IdentityKycState, IdentityKycContext> = {
  plan(state, _context) {
    const userSessions = Array.from(state.sessions.values()).filter(
      (s) => s.status !== "VERIFIED" && s.status !== "REJECTED",
    );
    const inDocsRequired = userSessions.some(
      (s) => s.status === "DOCS_REQUIRED",
    );
    const allTools: string[] = ["list_kyc_sessions", "get_kyc_session"];
    const allowedIntents: IdentityKycIntentKind[] = [];

    if (userSessions.length === 0) {
      allTools.push("start_kyc");
      allowedIntents.push("kyc.start");
    }
    if (inDocsRequired) {
      allTools.push("upload_document");
      allowedIntents.push("kyc.document.upload");
    }

    return {
      visibleReadTools: filterReadOnly(KYC_TOOLS, allTools),
      allowedIntents,
      // The LLM must never propose a vendor callback. Those are
      // system-trusted webhook events from the verification provider.
      forbiddenConcepts: ["kyc.vendor.callback"],
    };
  },
};

export const planner = safePlan(rawPlanner, KYC_TOOLS);

// ─── Taint policy ──────────────────────────────────────────────────────────
//
// Vendor callbacks are system events and must originate from a verified
// webhook handler — not from the LLM proposing one. This is the classic
// "LLM tells the system the verification passed" attack vector.
// `createSystemTaintPolicy` encodes the allowlist; the kernel rejects
// kyc.vendor.callback with UNTRUSTED before any business guard runs.

const taint = createSystemTaintPolicy({
  systemOnlyKinds: ["kyc.vendor.callback"],
});

// ─── Guards ────────────────────────────────────────────────────────────────

/**
 * kyc.start — always DEFERs, parking the intent until the user
 * uploads identity documents. The runtime resumes when the
 * `kyc.documents.uploaded` signal fires (typically from the adopter's
 * upload-handler webhook).
 */
const requireDocumentUpload = createStateDeferGuard<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
>({
  matches: (env) => env.kind === "kyc.start",
  signal: KYC_DOCUMENTS_UPLOADED_SIGNAL,
  timeoutMs: KYC_DOCUMENT_UPLOAD_TIMEOUT_MS,
  basis: [
    basis("state", "transition_valid", {
      reason: "documents_required",
      transition: "INIT→DOCS_REQUIRED",
    }),
  ],
});

/**
 * kyc.document.upload — always DEFERs while the verification provider
 * processes the document. The runtime resumes when the
 * `kyc.vendor.completed` signal fires (from the vendor's webhook
 * handler).
 */
const waitForVerification = createStateDeferGuard<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
>({
  matches: (env) => env.kind === "kyc.document.upload",
  signal: KYC_VENDOR_COMPLETED_SIGNAL,
  timeoutMs: KYC_VENDOR_TIMEOUT_MS,
  basis: [
    basis("state", "transition_valid", {
      reason: "vendor_verification_pending",
      transition: "DOCS_REQUIRED→VENDOR_PENDING",
    }),
  ],
});

/**
 * kyc.vendor.callback with `amlStatus: "FLAGGED"` ESCALATEs to a human
 * reviewer. The reason includes the AML match score + entity so the
 * Operator Console (Phase 2a) surfaces actionable detail in the
 * governance event log — not just "AML flagged" with no follow-on.
 *
 * Ordered before refuseLowScore + executeOnHighScore so AML hits beat
 * any score-based decision (a high-scoring identity that ALSO matches
 * a watchlist still escalates).
 *
 * Stays inline (not a Layer-2 primitive): the AML check isn't a
 * threshold-crossing — it's a discrete enum match. Lifting it would
 * require a `createEnumMatchGuard` factory we don't have a second
 * use case for yet.
 */
const escalateOnAmlFlag: Guard<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
> = (envelope) => {
  if (envelope.kind !== "kyc.vendor.callback") return null;
  const payload = envelope.payload as KycVendorCallbackPayload;
  if (payload.amlStatus !== "FLAGGED") return null;

  const reason =
    payload.amlMatchEntity !== undefined &&
    payload.amlMatchScore !== undefined
      ? `AML Watchlist Hit: ${payload.amlMatchScore}% match against ${payload.amlMatchEntity}`
      : "AML Watchlist Hit — review required";

  return decisionEscalate("human", reason, [
    basis("business", "rule_violated", {
      rule: "aml_screening",
      ...(payload.amlMatchScore !== undefined
        ? { matchScore: payload.amlMatchScore }
        : {}),
      ...(payload.amlMatchEntity !== undefined
        ? { matchEntity: payload.amlMatchEntity }
        : {}),
    }),
  ]);
};

/**
 * kyc.vendor.callback with `score < KYC_REFUSE_THRESHOLD` REFUSEs. The
 * user-facing copy is intentionally generic ("contact support") —
 * security-by-obscurity for the score threshold. The detailed score
 * appears in `refusal.detail` for operators reviewing the audit log.
 */
const refuseLowScore = createThresholdGuard<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
>({
  matches: (env) => env.kind === "kyc.vendor.callback",
  extract: (env) => (env.payload as KycVendorCallbackPayload).score,
  threshold: KYC_REFUSE_THRESHOLD,
  comparator: "<",
  onCross: (score, threshold) =>
    decisionRefuse(
      refuse(
        "BUSINESS_RULE",
        "kyc.verification_score_too_low",
        "We couldn't verify your identity. Please contact support.",
        `score=${score}/100, threshold=${threshold}`,
      ),
      [
        basis("business", "rule_violated", {
          rule: "verification_score",
          score,
          threshold,
        }),
      ],
    ),
});

/**
 * kyc.vendor.callback with `score ≥ KYC_EXECUTE_THRESHOLD` (and CLEAR
 * aml — guaranteed by earlier ordering) EXECUTEs the verification. The
 * session advances from VENDOR_PENDING to VERIFIED.
 */
const executeOnHighScore = createThresholdGuard<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
>({
  matches: (env) => env.kind === "kyc.vendor.callback",
  extract: (env) => (env.payload as KycVendorCallbackPayload).score,
  threshold: KYC_EXECUTE_THRESHOLD,
  comparator: ">=",
  onCross: (score) =>
    decisionExecute([
      basis("business", "rule_satisfied", {
        rule: "verification_score",
        score,
      }),
      basis("state", "transition_valid", {
        transition: "VENDOR_PENDING→VERIFIED",
      }),
    ]),
});

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const policy: PolicyBundle<
  IdentityKycIntentKind,
  IdentityKycPayload,
  IdentityKycState
> = {
  stateGuards: [],
  authGuards: [],
  taint,
  business: [
    // DEFER guards — handle the async progression
    requireDocumentUpload,
    waitForVerification,
    // Terminal guards for kyc.vendor.callback (ordered by specificity)
    escalateOnAmlFlag,
    refuseLowScore,
    executeOnHighScore,
  ],
  // Borderline scores (50 ≤ score < 90, CLEAR) fall through to REFUSE.
  default: "REFUSE",
};
