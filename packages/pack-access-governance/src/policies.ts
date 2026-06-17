import {
  basis,
  BASIS_CODES,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  refuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  createDataClassificationGuard,
  createRewriteGuard,
  createStateDeferGuard,
} from "@adjudicate/primitives";
import {
  accessKey,
  accessTaintPolicy,
  ACCESS_DEFAULT_DEFER_TIMEOUT_MS,
  ACCESS_REVIEW_RESOLVED_SIGNAL,
  KNOWN_RESOURCE_IDS,
  MAX_SELF_SERVICE_LEVEL,
  SENSITIVE_RESOURCE_IDS,
  type AccessBreakglassPayload,
  type AccessIntentKind,
  type AccessRequestPayload,
  type AccessReview,
  type AccessRevokePayload,
  type AccessState,
} from "./types.js";
import {
  refuseInvalidPrivilegeLevel,
  refuseNoActiveGrant,
  refuseReviewRejected,
  refuseUnknownResource,
} from "./refusals.js";

type AccessGuard = Guard<AccessIntentKind, unknown, AccessState>;

const req = (p: unknown): AccessRequestPayload => p as AccessRequestPayload;
const rev = (p: unknown): AccessRevokePayload => p as AccessRevokePayload;

function reviewFor(state: AccessState, p: AccessRequestPayload): AccessReview | undefined {
  return state.reviews.get(accessKey(p.resourceId, p.principal));
}

// ── state guards ────────────────────────────────────────────────────────────

const validateResource: AccessGuard = nameGuard("validateResource", (envelope) => {
  if (envelope.kind === "access.review.resolve") return null;
  const resourceId = (envelope.payload as { resourceId?: string }).resourceId ?? "";
  if (!KNOWN_RESOURCE_IDS.has(resourceId)) {
    return decisionRefuse(refuseUnknownResource(resourceId), [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, { resourceId }),
    ]);
  }
  return null;
});

const validatePrivilegeLevel: AccessGuard = nameGuard("validatePrivilegeLevel", (envelope) => {
  if (envelope.kind !== "access.request") return null;
  const lvl = req(envelope.payload).privilegeLevel;
  if (lvl !== 0 && lvl !== 1 && lvl !== 2) {
    return decisionRefuse(refuseInvalidPrivilegeLevel(lvl), [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, { rule: "privilege_level" }),
    ]);
  }
  return null;
});

const requireActiveGrantForRevoke: AccessGuard = nameGuard("requireActiveGrantForRevoke", (envelope, state) => {
  if (envelope.kind !== "access.revoke") return null;
  const p = rev(envelope.payload);
  if (!state.grants.has(accessKey(p.resourceId, p.principal))) {
    return decisionRefuse(refuseNoActiveGrant(accessKey(p.resourceId, p.principal)), [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {}),
    ]);
  }
  return null;
});

// Refuse operating on an EXPIRED grant (ADR-142). Pure + replay-safe: compares
// grant.expiresAt against envelope.createdAt (the replayable, audit-preserved
// clock — never Date.now()). Date.parse parses replayable strings only, no clock
// read. Runs after requireActiveGrantForRevoke so a missing grant → no_active_grant
// and a present-but-expired grant → grant_expired. Boundary createdAt==expiresAt
// counts as expired (<=).
const refuseExpiredGrant: AccessGuard = nameGuard("refuseExpiredGrant", (envelope, state) => {
  if (envelope.kind !== "access.revoke") return null;
  const p = rev(envelope.payload);
  const grant = state.grants.get(accessKey(p.resourceId, p.principal));
  if (grant?.expiresAt !== undefined && Date.parse(grant.expiresAt) <= Date.parse(envelope.createdAt)) {
    return decisionRefuse(
      refuse("STATE", "grant_expired", "That access grant has already expired.", `grant expired at ${grant.expiresAt}`),
      [basis("state", BASIS_CODES.state.GRANT_EXPIRED, {
        resourceId: p.resourceId,
        principal: p.principal,
        expiresAt: grant.expiresAt,
      })],
    );
  }
  return null;
});

// ── business guards ─────────────────────────────────────────────────────────

const allowResolve: AccessGuard = nameGuard("allowResolve", (envelope) =>
  envelope.kind === "access.review.resolve"
    ? decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID, { source: "review" })])
    : null,
);

/** Emergency grants are capped at 1h regardless of the requested ttlMs. */
const BREAKGLASS_MAX_TTL_MS = 60 * 60 * 1000;

// Break-glass (ADR-142). Reaches here only when TRUSTED (the taint gate refuses
// UNTRUSTED break-glass for free). ttlMs is mandatory: missing/invalid → REFUSE
// (BREAKGLASS_TTL_INVALID); valid → EXECUTE (BREAKGLASS_GRANTED). The adopter then
// mints the grant with expiresAt = createdAt + ttlMs post-turn (out of path).
const executeBreakglass: AccessGuard = nameGuard("executeBreakglass", (envelope) => {
  if (envelope.kind !== "access.breakglass") return null;
  const p = envelope.payload as Partial<AccessBreakglassPayload>;
  const ttlMs = p.ttlMs;
  if (typeof ttlMs !== "number" || !Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > BREAKGLASS_MAX_TTL_MS) {
    return decisionRefuse(
      refuse("BUSINESS_RULE", "breakglass_ttl_invalid", "Emergency access requires a valid time limit.", `ttlMs must be a positive integer ≤ ${BREAKGLASS_MAX_TTL_MS}`),
      [basis("business", BASIS_CODES.business.BREAKGLASS_TTL_INVALID, { ttlMs: ttlMs ?? null })],
    );
  }
  return decisionExecute([basis("business", BASIS_CODES.business.BREAKGLASS_GRANTED, {
    resourceId: p.resourceId,
    principal: p.principal,
    privilegeLevel: p.privilegeLevel,
    ttlMs,
    grantedAt: envelope.createdAt,
  })]);
});

/**
 * Redact PII from the free-text `justification` before the request is processed
 * (ADR-117). Access-request justifications routinely paste in personal data
 * (SSNs, emails); this REWRITEs the matched field (taint preserved) so the
 * downstream review/grant flow and the audit trail never carry raw PII. Runs
 * first so the redacted request re-adjudicates through the normal flow. A
 * justification with no classified data returns null (no-op).
 */
const redactJustificationPii: AccessGuard = nameGuard(
  "redactJustificationPii",
  createDataClassificationGuard<AccessIntentKind, unknown, AccessState>({
    matches: (envelope) => envelope.kind === "access.request",
    patterns: [
      { id: "ssn", pattern: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/ },
      { id: "email", pattern: /\b[\w.+-]+@[\w-]+\.[\w][\w.-]*\b/ },
    ],
    scannedFields: ["justification"],
    action: "REWRITE",
    sensitivityLevel: "medium",
    reason: "Redacted PII from the access-request justification.",
  }),
);

const escalateSensitiveResource: AccessGuard = nameGuard("escalateSensitiveResource", (envelope, state) => {
  if (envelope.kind !== "access.request") return null;
  const p = req(envelope.payload);
  const review = reviewFor(state, p);
  if (SENSITIVE_RESOURCE_IDS.has(p.resourceId) && review?.decision !== "approved") {
    return decisionEscalate("human", `Sensitive resource ${p.resourceId} requires human review.`, [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, { resourceId: p.resourceId }),
    ]);
  }
  return null;
});

const refuseRejectedRequest: AccessGuard = nameGuard("refuseRejectedRequest", (envelope, state) => {
  if (envelope.kind !== "access.request") return null;
  const p = req(envelope.payload);
  if (reviewFor(state, p)?.decision === "rejected") {
    return decisionRefuse(refuseReviewRejected(p.resourceId), [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, { resourceId: p.resourceId }),
    ]);
  }
  return null;
});

function maxAllowedLevel(state: AccessState, p: AccessRequestPayload): number {
  const review = reviewFor(state, p);
  if (review?.decision === "approved" && review.grantedLevel !== undefined) return review.grantedLevel;
  return MAX_SELF_SERVICE_LEVEL;
}

const reduceToLeastPrivilege: AccessGuard = nameGuard(
  "reduceToLeastPrivilege",
  createRewriteGuard<AccessIntentKind, unknown, AccessState>({
    matches: (envelope) => envelope.kind === "access.request",
    extract: (envelope) => req(envelope.payload).privilegeLevel,
    cap: (state, envelope) => maxAllowedLevel(state, req(envelope.payload)),
    mutateField: "privilegeLevel",
    reason: "Reduced to least-privilege level.",
  }),
);

const deferPendingReview: AccessGuard = nameGuard(
  "deferPendingReview",
  createStateDeferGuard<AccessIntentKind, unknown, AccessState>({
    matches: (envelope, state) =>
      envelope.kind === "access.request" && reviewFor(state, req(envelope.payload)) === undefined,
    signal: ACCESS_REVIEW_RESOLVED_SIGNAL,
    timeoutMs: ACCESS_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_review",
        waitFor: ACCESS_REVIEW_RESOLVED_SIGNAL,
      }),
    ],
  }),
);

const confirmRevoke: AccessGuard = nameGuard("confirmRevoke", (envelope) => {
  if (envelope.kind !== "access.revoke") return null;
  const p = rev(envelope.payload);
  if (!p.confirmationToken) {
    return decisionRequestConfirmation(`Revoke ${p.principal}'s access to ${p.resourceId}?`, [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, { rule: "revoke_confirm" }),
    ]);
  }
  return null;
});

const executeApprovedRequest: AccessGuard = nameGuard("executeApprovedRequest", (envelope, state) => {
  if (envelope.kind !== "access.request") return null;
  const p = req(envelope.payload);
  const review = reviewFor(state, p);
  if (review?.decision === "approved" && (review.grantedLevel ?? 0) >= p.privilegeLevel) {
    return decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED, { rule: "approved_grant" })]);
  }
  return null;
});

const executeConfirmedRevoke: AccessGuard = nameGuard("executeConfirmedRevoke", (envelope) => {
  if (envelope.kind !== "access.revoke") return null;
  return rev(envelope.payload).confirmationToken
    ? decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED, { rule: "confirmed_revoke" })])
    : null;
});

export const accessPolicyBundle: PolicyBundle<AccessIntentKind, unknown, AccessState> = {
  stateGuards: [validateResource, validatePrivilegeLevel, requireActiveGrantForRevoke, refuseExpiredGrant],
  authGuards: [],
  taint: accessTaintPolicy,
  business: [
    redactJustificationPii,
    allowResolve,
    executeBreakglass,
    escalateSensitiveResource,
    reduceToLeastPrivilege,
    refuseRejectedRequest,
    deferPendingReview,
    confirmRevoke,
    executeApprovedRequest,
    executeConfirmedRevoke,
  ],
  default: "REFUSE",
};
