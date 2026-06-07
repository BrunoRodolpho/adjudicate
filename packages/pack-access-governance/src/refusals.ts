import { refuse, type Refusal } from "@adjudicate/core";

export const refuseUnknownResource = (id: string): Refusal =>
  refuse("STATE", "access.resource_unknown", "That resource doesn't exist.", `unknown resource ${id}`);

export const refuseInvalidPrivilegeLevel = (seen: unknown): Refusal =>
  refuse("BUSINESS_RULE", "access.privilege_level_invalid", "That privilege level is invalid.", `got ${String(seen)}`);

export const refuseReviewRejected = (id: string): Refusal =>
  refuse("BUSINESS_RULE", "access.review_rejected", "Your access request was rejected.", `review rejected for ${id}`);

export const refuseNoActiveGrant = (id: string): Refusal =>
  refuse("STATE", "access.no_active_grant", "There's no active grant to revoke.", `no grant for ${id}`);
