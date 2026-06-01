/**
 * Row mapping for the `governance_events` table (migration 004).
 *
 * Mirror of the existing `recordToRow`/`rowToRecord` pattern in
 * `postgres-sink.ts`/`replay.ts`, but for governance events instead of
 * intent audits. The Postgres column for `actor` is JSONB; pg drivers
 * return parsed JSON automatically, so we accept the parsed object
 * directly.
 */

import {
  ActorSchema,
  EmergencyStatusSchema,
  type Actor,
  type GovernanceEvent,
} from "@adjudicate/admin-sdk";
import { normalizeTimestamptz } from "./pg-types.js";

/** Shape of one row in the `governance_events` table. */
export interface GovernanceEventRow {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly actor: Actor;
  readonly previous_status: string;
  readonly new_status: string;
  readonly reason: string;
}

/**
 * Convert a `GovernanceEvent` (SDK domain type) to its `governance_events`
 * row shape. Used by adopters wiring `PostgresGovernanceWriter`.
 */
export function governanceEventToRow(e: GovernanceEvent): GovernanceEventRow {
  return {
    id: e.id,
    at: e.at,
    kind: e.kind,
    actor: e.actor,
    previous_status: e.previousStatus,
    new_status: e.newStatus,
    reason: e.reason,
  };
}

/**
 * Reconstruct a `GovernanceEvent` from a stored row. Inverse of
 * `governanceEventToRow`. Defensive on TIMESTAMPTZ — accepts string or
 * Date and normalizes.
 */
export function rowToGovernanceEvent(
  row: GovernanceEventRow,
): GovernanceEvent {
  // Zod is the canonical gate at this trust boundary (migration 004 docstring):
  // `kind`, `actor` (raw JSONB), and the status TEXT columns arrive unvalidated
  // from Postgres. Validate each instead of blind-casting — same fail-loud
  // contract as `normalizeTimestamptz` (pg-types.ts).
  const kindLiteral = row.kind;
  if (kindLiteral !== "emergency.update") {
    throw new Error(
      `audit-postgres: unexpected governance_events.kind — expected "emergency.update", got: ${JSON.stringify(kindLiteral)}`,
    );
  }
  const actorResult = ActorSchema.safeParse(row.actor);
  if (!actorResult.success) {
    throw new Error(
      `audit-postgres: governance_events.actor failed validation: ${actorResult.error.message}`,
    );
  }
  const prevResult = EmergencyStatusSchema.safeParse(row.previous_status);
  if (!prevResult.success) {
    throw new Error(
      `audit-postgres: governance_events.previous_status failed validation: got ${JSON.stringify(row.previous_status)}`,
    );
  }
  const newResult = EmergencyStatusSchema.safeParse(row.new_status);
  if (!newResult.success) {
    throw new Error(
      `audit-postgres: governance_events.new_status failed validation: got ${JSON.stringify(row.new_status)}`,
    );
  }
  return {
    id: row.id,
    at: normalizeTimestamptz(row.at, "governance_events.at"),
    kind: kindLiteral,
    actor: actorResult.data,
    previousStatus: prevResult.data,
    newStatus: newResult.data,
    reason: row.reason,
  };
}
