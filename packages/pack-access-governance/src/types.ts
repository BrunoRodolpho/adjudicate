import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type AccessIntentKind = "access.request" | "access.review.resolve" | "access.revoke";

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
  readonly confirmationToken?: string;
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
}

export interface AccessState {
  readonly reviews: ReadonlyMap<string, AccessReview>;
  readonly grants: ReadonlyMap<string, AccessGrant>;
}

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

/** review.resolve is system/operator-only (TRUSTED) — the LLM cannot self-approve. */
export const accessTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["access.review.resolve"],
});
