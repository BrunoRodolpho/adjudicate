/**
 * Row mapping for the `governance_events` table (migration 004).
 *
 * Mirror of the existing `recordToRow`/`rowToRecord` pattern in
 * `postgres-sink.ts`/`replay.ts`, but for governance events instead of
 * intent audits. The Postgres column for `actor` is JSONB; pg drivers
 * return parsed JSON automatically, so we accept the parsed object
 * directly.
 */

import type { Actor, GovernanceEvent } from "@adjudicate/admin-sdk";
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
  // The schema (migration 004) constrains kind = 'emergency.update' for
  // Phase 2a; future kinds extend this. The `as` narrowing matches the
  // SDK's literal type for the current vocabulary.
  return {
    id: row.id,
    at: normalizeTimestamptz(row.at, "governance_events.at"),
    kind: row.kind as "emergency.update",
    actor: row.actor,
    previousStatus: row.previous_status as GovernanceEvent["previousStatus"],
    newStatus: row.new_status as GovernanceEvent["newStatus"],
    reason: row.reason,
  };
}
