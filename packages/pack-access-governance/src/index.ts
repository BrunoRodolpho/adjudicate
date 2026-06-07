/**
 * @adjudicate/pack-access-governance — agent access-request governance Pack.
 *
 * Governs an access request → review → grant/revoke lifecycle, exercising all
 * six Decision outcomes:
 *   - DEFER     a request with no resolved review (awaiting review)
 *   - REWRITE   clamp an over-provisioned request to least privilege
 *   - ESCALATE  sensitive-resource access (to a human reviewer)
 *   - REQUEST_CONFIRMATION before a destructive revoke
 *   - REFUSE    unknown resource / rejected review / no active grant
 *   - EXECUTE   approved request, review resolution, confirmed revoke
 *
 * `access.review.resolve` is system/operator-only (TRUSTED). See README.
 */
import type { PackV0 } from "@adjudicate/core";
import { accessCapabilityPlanner } from "./capabilities.js";
import { accessPolicyBundle } from "./policies.js";
import type {
  AccessContext,
  AccessGrant,
  AccessIntentKind,
  AccessReview,
  AccessState,
} from "./types.js";

function rebuildMap<V>(raw: unknown): ReadonlyMap<string, V> {
  if (raw instanceof Map) return raw as ReadonlyMap<string, V>;
  if (typeof raw === "object" && raw !== null) {
    return new Map(Object.entries(raw as Record<string, V>));
  }
  return new Map();
}

export function rehydrateAccessState(raw: unknown): AccessState {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as {
    reviews?: unknown;
    grants?: unknown;
  };
  return {
    reviews: rebuildMap<AccessReview>(obj.reviews),
    grants: rebuildMap<AccessGrant>(obj.grants),
  };
}

export * from "./types.js";
export { accessPolicyBundle } from "./policies.js";
export { ACCESS_TOOLS, accessCapabilityPlanner } from "./capabilities.js";
export {
  refuseUnknownResource,
  refuseInvalidPrivilegeLevel,
  refuseReviewRejected,
  refuseNoActiveGrant,
} from "./refusals.js";

export const accessGovernancePack = {
  id: "pack-access-governance",
  version: "0.1.0-experimental",
  contract: "v0",
  intents: ["access.request", "access.review.resolve", "access.revoke"],
  policy: accessPolicyBundle,
  planner: accessCapabilityPlanner,
  basisCodes: [
    "access.resource_unknown",
    "access.privilege_level_invalid",
    "access.review_rejected",
    "access.no_active_grant",
  ],
  signals: ["access.review.resolved"],
  rehydrateState: rehydrateAccessState,
} as const satisfies PackV0<AccessIntentKind, unknown, AccessState, AccessContext>;
