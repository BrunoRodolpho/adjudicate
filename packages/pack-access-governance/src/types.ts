import type { AuthorityGraphStore } from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type AccessIntentKind =
  | "access.request"
  | "access.review.resolve"
  | "access.revoke"
  | "access.breakglass";

/** read | write | admin */
export type AccessPrivilegeLevel = 0 | 1 | 2;

export interface AccessRequestPayload {
  readonly principal: string;
  readonly resourceId: string;
  readonly privilegeLevel: AccessPrivilegeLevel;
  readonly justification: string;
}

export interface AccessReviewResolvePayload {
  readonly resourceId: string;
  readonly principal: string;
  readonly reviewer: string;
  readonly decision: "approved" | "rejected";
  readonly grantedLevel?: AccessPrivilegeLevel;
}

export interface AccessRevokePayload {
  readonly principal: string;
  readonly resourceId: string;
}

/**
 * Emergency break-glass access (ADR-142). System/operator-only (TRUSTED) — see
 * `accessTaintPolicy`. `ttlMs` is MANDATORY: a missing/invalid value REFUSEs
 * (BREAKGLASS_TTL_INVALID). On EXECUTE (BREAKGLASS_GRANTED), the adopter mints a
 * grant with `grantedAt = envelope.createdAt` and `expiresAt = grantedAt + ttlMs`.
 */
export interface AccessBreakglassPayload {
  readonly principal: string;
  readonly resourceId: string;
  readonly privilegeLevel: AccessPrivilegeLevel;
  readonly justification: string;
  readonly ttlMs: number;
}

export interface AccessReview {
  readonly resourceId: string;
  readonly principal: string;
  readonly decision: "approved" | "rejected";
  readonly grantedLevel?: AccessPrivilegeLevel;
  readonly at: string;
}

export interface AccessGrant {
  readonly principal: string;
  readonly resourceId: string;
  readonly privilegeLevel: AccessPrivilegeLevel;
  /** ISO-8601 mint time (= `envelope.createdAt` of the granting turn). */
  readonly grantedAt?: string;
  /**
   * ISO-8601 expiry (= `grantedAt + ttlMs`), minted POST-TURN by the adopter on
   * the replayable `envelope.createdAt` clock — never `Date.now()`. A grant with
   * `expiresAt <= envelope.createdAt` is treated as expired (refuseExpiredGrant).
   */
  readonly expiresAt?: string;
}

/**
 * Host-supplied authority context the constitutional authority guard (034) reads
 * from `state` (the kernel never passes identity to a guard — auth facts flow
 * through `state`). INJECTED immutable snapshot (index §B/§D): the authority-graph
 * store (032/033) plus the IDOR-closing host-identity seam.
 *
 * OPTIONAL (035 wiring contract). Absent ⇒ the authority guard is inert (the
 * pre-035 posture the conformance/scenario tests use); present ⇒ the guard is
 * binding + fail-closed for the mutating UNTRUSTED kinds (`access.request`,
 * `access.revoke`). See `PixAuthorityContext` for the identical IDOR residual:
 * `principalOf` MUST resolve the AUTHENTICATED principal from `actor.sessionId`
 * (a trusted host session→identity map) — NEVER from the payload — and its
 * namespace MUST match the authority-graph principal names (034-F2).
 */
export interface AccessAuthorityContext {
  /** The injected authority-graph snapshot store (032/033). */
  readonly store: AuthorityGraphStore;
  /**
   * IDOR-closing host-identity seam: AUTHENTICATED principal for a sessionId, or
   * `null` for an unknown/unauthenticated session (the guard then REFUSEs,
   * fail-closed). NEVER read from the payload.
   */
  readonly principalOf?: (sessionId: string) => string | null;
}

export interface AccessState {
  readonly reviews: ReadonlyMap<string, AccessReview>;
  readonly grants: ReadonlyMap<string, AccessGrant>;
  /**
   * OPTIONAL injected authority context (032/033/034). Present ⇒ the authority
   * guard in `authGuards` is binding for mutating UNTRUSTED kinds; absent ⇒
   * inert. See `AccessAuthorityContext` for the IDOR residual.
   */
  readonly authority?: AccessAuthorityContext;
}

/**
 * Read-only context the planner consumes. `requesterId` is the host's view of
 * the requesting principal at plan time; it is NOT an authenticated-identity
 * source for the kernel auth guard (which reads `state.authority`, not context).
 */
export interface AccessContext {
  readonly requesterId: string;
}

export function accessKey(resourceId: string, principal: string): string {
  return `${resourceId}::${principal}`;
}

/** Known resources (an unknown resourceId is REFUSED). */
export const KNOWN_RESOURCE_IDS: ReadonlySet<string> = new Set([
  "db.analytics",
  "db.prod",
  "payroll",
  "secrets.vault",
]);

/** Sensitive resources escalate to a human reviewer rather than self-service. */
export const SENSITIVE_RESOURCE_IDS: ReadonlySet<string> = new Set(["payroll", "secrets.vault"]);

/** Highest level a self-service (no-review) request may keep; above → REWRITE clamp. */
export const MAX_SELF_SERVICE_LEVEL: AccessPrivilegeLevel = 0;

export const ACCESS_REVIEW_RESOLVED_SIGNAL = "access.review.resolved";
export const ACCESS_DEFAULT_DEFER_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * review.resolve and break-glass are system/operator-only (TRUSTED): the LLM
 * cannot self-approve, and cannot forge an UNTRUSTED emergency grant (the kernel
 * taint gate refuses it for free before any business guard runs).
 */
export const accessTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["access.review.resolve", "access.breakglass"],
});
