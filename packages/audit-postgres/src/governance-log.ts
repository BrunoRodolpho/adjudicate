/**
 * `createPostgresGovernanceLog` — durable storage for operator actions.
 *
 * NOT a full `EmergencyStateStore` implementation — the live state
 * (current `status`, `reason`, `toggledAt`, `toggledBy`) stays in-memory
 * in Phase 1.5c because the kernel's `DistributedKillSwitch` polls
 * Redis, not Postgres; persisting state to Postgres would be a
 * "hallucination of control" — the kernel wouldn't see the writes.
 *
 * What this DOES persist: the audit log of WHO TOGGLED WHAT WHEN AND
 * WHY. That trail is durable and queryable across restarts. Phase 1.5d
 * adds a Redis impl for the live state half.
 *
 * The console wires this log alongside the in-memory state store via
 * the `createDurableEmergencyStore` composite (in
 * `apps/console/src/lib/durable-emergency-store.ts`).
 */

import type { GovernanceEvent } from "@adjudicate/admin-sdk";
import {
  governanceEventToRow,
  rowToGovernanceEvent,
  type GovernanceEventRow,
} from "./governance-events.js";
import type {
  PostgresGovernanceWriter,
  PostgresReader,
} from "./pg-reader.js";

export interface PostgresGovernanceLog {
  /** Persist a governance event. Idempotent on `id` (PK). */
  insert(event: GovernanceEvent): Promise<void>;
  /** Read recent events, newest-first. */
  history(limit: number): Promise<readonly GovernanceEvent[]>;
}

export interface CreatePostgresGovernanceLogDeps {
  readonly reader: PostgresReader;
  readonly writer: PostgresGovernanceWriter;
}

export function createPostgresGovernanceLog(
  deps: CreatePostgresGovernanceLogDeps,
): PostgresGovernanceLog {
  return {
    async insert(event: GovernanceEvent): Promise<void> {
      await deps.writer.insertGovernanceEvent(governanceEventToRow(event));
    },

    async history(limit: number): Promise<readonly GovernanceEvent[]> {
      const sql = `
        SELECT id, at, kind, actor, previous_status, new_status, reason
        FROM governance_events
        ORDER BY at DESC
        LIMIT $1
      `.replace(/\s+/g, " ").trim();

      const rows = await deps.reader.query<GovernanceEventRow>(sql, [limit]);
      return rows.map(rowToGovernanceEvent);
    },
  };
}

/**
 * Reference INSERT statement for the `governance_events` table.
 * Adopters wrap their `pg`/`postgres.js`/Prisma client into a
 * `PostgresGovernanceWriter` whose `insertGovernanceEvent` runs this
 * statement. Exposed as a constant so the SQL stays in this package
 * (single source of truth for the row shape).
 */
export const INSERT_GOVERNANCE_EVENT_SQL = `
  INSERT INTO governance_events
    (id, at, kind, actor, previous_status, new_status, reason)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (id) DO NOTHING
`.replace(/\s+/g, " ").trim();

/**
 * Helper to convert a `GovernanceEventRow` to the parameter array for
 * `INSERT_GOVERNANCE_EVENT_SQL`. Adopters use this to keep the column
 * order in sync with the SQL constant.
 */
export function governanceInsertParams(
  row: GovernanceEventRow,
): readonly unknown[] {
  return [
    row.id,
    row.at,
    row.kind,
    row.actor,
    row.previous_status,
    row.new_status,
    row.reason,
  ];
}
