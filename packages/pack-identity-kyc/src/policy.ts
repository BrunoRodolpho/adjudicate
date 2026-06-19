import {
  basis,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  refuse,
  type Guard,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard } from "@adjudicate/core/kernel";
import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type ToolClassification,
} from "@adjudicate/core/llm";
import {
  createEscalateGuard,
  createStateDeferGuard,
  createSystemTaintPolicy,
  createThresholdGuard,
} from "@adjudicate/primitives";
import {
  KYC_DOCUMENT_UPLOAD_TIMEOUT_MS,
  KYC_DOCUMENTS_UPLOADED_SIGNAL,
  KYC_EXECUTE_THRESHOLD,
  KYC_REFUSE_THRESHOLD,
  KYC_SANCTIONS_MATCH_THRESHOLD,
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
 *   1. requireDocumentUpload          — kyc.start always DEFERs for documents
 *   2. waitForVerification            — kyc.document.upload always DEFERs for vendor
 *   3. escalateOnAmlFlag              — kyc.vendor.callback ESCALATEs if amlStatus FLAGGED
 *   4. escalateOnSanctionsMatchScore  — kyc.vendor.callback ESCALATEs if amlMatchScore ≥ 80
 *   5. refuseLowScore                 — kyc.vendor.callback REFUSEs if score < 50
 *   6. executeOnHighScore             — kyc.vendor.callback EXECUTEs if score ≥ 90
 *
 * The two sanctions/OFAC escalate guards (3+4) form an escalate-only UNION
 * (plan 102): FLAGGED (score-independent) OR amlMatchScore ≥ threshold. Both
 * are ordered before the score guards (5+6) so a sanctions signal can only
 * raise friction to a human, never authorize EXECUTE (§C monotonicity).
 *
 * Borderline (50 ≤ score < 90, CLEAR, no sanctions match) falls through to
 * `default: "REFUSE"` — conservative-by-default. Adopters can add a
 * REQUEST_CONFIRMATION guard for that range when their compliance team permits.
 *
 * Layer-2 primitives in use (Phase 5 refactor):
 *   - `createStateDeferGuard`     drives requireDocumentUpload + waitForVerification
 *   - `createEscalateGuard`       drives escalateOnSanctionsMatchScore (102)
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
// DOCS_REQUIRED. `kyc.vendor.callback` is omitted from `allowedIntents`
// in every state — the bridge refuses it before the kernel sees it, and
// `createSystemTaintPolicy` below enforces the system-only origin.

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
const requireDocumentUpload = nameGuard(
  "requireDocumentUpload",
  createStateDeferGuard<
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
  }),
);

/**
 * kyc.document.upload — always DEFERs while the verification provider
 * processes the document. The runtime resumes when the
 * `kyc.vendor.completed` signal fires (from the vendor's webhook
 * handler).
 */
const waitForVerification = nameGuard(
  "waitForVerification",
  createStateDeferGuard<
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
  }),
);

/**
 * Sanctions/OFAC screening signal — escalate-only (plan 102).
 *
 * The sanctions provider result rides as an injected snapshot on the
 * `kyc.vendor.callback` payload (`amlStatus` + `amlMatchScore` +
 * `amlMatchEntity`). The kernel reads it as a pure compliance signal that
 * may only ESCALATE to a human (or fall through to REFUSE) — it can NEVER
 * authorize EXECUTE and never waive a downstream gate. This preserves §C
 * monotonicity (inv. 7): a compliance signal sets a friction CEILING, never
 * a floor; only deterministic score rules can authorize EXECUTE.
 *
 * The signal escalates on the UNION of two INDEPENDENT conditions, neither
 * able to silently skip the other:
 *
 *   (a) `amlStatus === "FLAGGED"`  — a hard, score-INDEPENDENT escalate
 *       predicate. A vendor that sets the flag with NO `amlMatchScore` still
 *       escalates. Realized by `escalateOnAmlFlag` below.
 *   (b) `amlMatchScore >= KYC_SANCTIONS_MATCH_THRESHOLD` — a validated,
 *       range-checked watchlist correlation (previously `amlMatchScore` was
 *       never compared — only decoration). Realized by
 *       `escalateOnSanctionsMatchScore` (createEscalateGuard) below.
 *
 * The OR is implemented as TWO escalate-only checks — NOT a single
 * `createEscalateGuard` — because `createEscalateGuard` ANDs predicate +
 * threshold (guards.ts:435-439: abstains when `extract` is null/undefined or
 * the comparator does not cross). Folding the FLAGGED check into the score
 * guard would let a missing `amlMatchScore` gate the flag out — exactly the
 * "FLAGGED + no score never escalates" regression §7 warns about. So the
 * FLAGGED branch MUST be its own standalone check. Both branches emit only
 * ESCALATE → "human" with a business `rule_violated` basis.
 */

/**
 * (a) FLAGGED — the hard, score-independent escalate predicate. The reason
 * surfaces the AML match score + entity (when present) so the Operator
 * Console governance event log shows actionable detail.
 *
 * Ordered before refuseLowScore + executeOnHighScore so a FLAGGED hit beats
 * any score-based decision (a high-scoring identity that ALSO matches a
 * watchlist still escalates). Escalate-only — no `decisionExecute` path.
 *
 * Stays inline (not `createEscalateGuard`): this branch is a discrete enum
 * match with no threshold crossing, and it must NOT depend on `amlMatchScore`
 * being present. The `createEnumMatchGuard` factory the old comment wished for
 * does not exist; an inline guard is the correct shape for the flag branch.
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
      signal: "aml_flag",
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
 * (b) `amlMatchScore >= KYC_SANCTIONS_MATCH_THRESHOLD` — grounds the
 * watchlist match score in the escalate-only primitive contract
 * (`createEscalateGuard`, guards.ts:432-457). This makes `amlMatchScore` a
 * VALIDATED, range-checked signal instead of a never-compared decoration: a
 * strong sanctions correlation escalates for human review even if the vendor
 * did not set the hard `amlStatus: "FLAGGED"` flag (the additive friction
 * branch of the UNION).
 *
 * Escalate-only by construction: `createEscalateGuard` pins `onCross` to
 * `decisionEscalate` — there is no path to EXECUTE/REWRITE. Ordered before
 * refuseLowScore + executeOnHighScore so the kernel's first-non-null
 * short-circuit structurally prevents downgrade to EXECUTE (§C inv. 7),
 * mirroring `escalateRegressionScore` in pack-deployments-approval.
 *
 * Abstains (returns null) when `amlMatchScore` is absent — so the FLAGGED
 * branch (a) above carries the score-independent case.
 */
const escalateOnSanctionsMatchScore = nameGuard(
  "escalateOnSanctionsMatchScore",
  createEscalateGuard<
    IdentityKycIntentKind,
    IdentityKycPayload,
    IdentityKycState
  >({
    matches: (env) => env.kind === "kyc.vendor.callback",
    extract: (env) =>
      (env.payload as KycVendorCallbackPayload).amlMatchScore,
    threshold: KYC_SANCTIONS_MATCH_THRESHOLD,
    comparator: ">=",
    to: "human",
    reason: (value, threshold, env) => {
      const entity = (env.payload as KycVendorCallbackPayload).amlMatchEntity;
      return entity !== undefined
        ? `Sanctions screening: ${value}% watchlist match (≥ ${threshold}) against ${entity}`
        : `Sanctions screening: ${value}% watchlist match (≥ ${threshold}) — review required`;
    },
    basis: (value, threshold, env) => {
      const entity = (env.payload as KycVendorCallbackPayload).amlMatchEntity;
      return [
        basis("business", "rule_violated", {
          rule: "aml_screening",
          signal: "sanctions_match_score",
          matchScore: value,
          threshold,
          ...(entity !== undefined ? { matchEntity: entity } : {}),
        }),
      ];
    },
  }),
);

/**
 * kyc.vendor.callback with `score < KYC_REFUSE_THRESHOLD` REFUSEs. The
 * user-facing copy is intentionally generic ("contact support") —
 * security-by-obscurity for the score threshold. The detailed score
 * appears in `refusal.detail` for operators reviewing the audit log.
 */
const refuseLowScore = nameGuard(
  "refuseLowScore",
  createThresholdGuard<
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
  }),
);

/**
 * kyc.vendor.callback with `score ≥ KYC_EXECUTE_THRESHOLD` (and CLEAR
 * aml — guaranteed by earlier ordering) EXECUTEs the verification. The
 * session advances from VENDOR_PENDING to VERIFIED.
 */
const executeOnHighScore = nameGuard(
  "executeOnHighScore",
  createThresholdGuard<
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
  }),
);

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
    // Sanctions/OFAC escalate-only signal (102) — the UNION's two branches,
    // BOTH ordered before refuseLowScore/executeOnHighScore so the kernel's
    // first-non-null short-circuit structurally prevents any downgrade to
    // EXECUTE (§C monotonicity, inv. 7).
    escalateOnAmlFlag, // (a) FLAGGED — score-independent
    escalateOnSanctionsMatchScore, // (b) amlMatchScore ≥ threshold
    // Terminal score guards for kyc.vendor.callback (ordered by specificity)
    refuseLowScore,
    executeOnHighScore,
  ],
  // Borderline scores (50 ≤ score < 90, CLEAR) fall through to REFUSE.
  default: "REFUSE",
};
