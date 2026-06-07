import { refuse, type Refusal } from "@adjudicate/core";

export const refuseIncidentNotFound = (id: string): Refusal =>
  refuse("STATE", "incident.not_found", "That incident doesn't exist.", `no incident ${id}`);

export const refuseIncidentResolved = (id: string): Refusal =>
  refuse("STATE", "incident.already_resolved", "That incident is already resolved.", `incident ${id} is terminal`);

export const refuseInvalidBlastRadius = (seen: unknown): Refusal =>
  refuse(
    "BUSINESS_RULE",
    "incident.blast_radius_invalid",
    "That remediation scope is invalid.",
    `blastRadius must be a non-negative integer (got ${String(seen)})`,
  );
