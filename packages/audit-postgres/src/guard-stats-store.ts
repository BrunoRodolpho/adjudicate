/**
 * Postgres-backed GuardFireStatsStore. Plugs into core's `GuardFireStats`
 * accumulator so guard-fire counters survive restarts.
 *
 * Writes are UPSERTs that add to the per-day natural key. The natural key
 * is `(guard_name, guard_phase, decision_kind, day, COALESCE(pack_id,''))`
 * — the `COALESCE` lives in the upsert path rather than the constraint
 * because Postgres treats NULL as distinct in unique constraints.
 *
 * Reads return rows newer-than the supplied ISO `since`, optionally
 * filtered by pack.
 */

import type {
  GuardFireBucket,
  GuardFireStatsStore,
  GuardPhase,
} from "@adjudicate/core";
import type { PostgresReader, PostgresGovernanceWriter } from "./pg-reader.js";

interface GuardStatsRow {
  guard_name: string;
  guard_phase: GuardPhase;
  decision_kind: GuardFireBucket["decisionKind"];
  day: string | Date;
  count: string | number;
}

/**
 * Adopter-implemented writer for guard-stats UPSERTs. Companion to
 * `PostgresGovernanceWriter` — kept distinct so adopters who only want
 * reads don't pay for the write dep.
 */
export interface GuardStatsWriter {
  upsertGuardStat(args: {
    readonly guardName: string;
    readonly guardPhase: GuardPhase;
    readonly decisionKind: GuardFireBucket["decisionKind"];
    readonly day: string;
    readonly packId: string | null;
    readonly countDelta: number;
  }): Promise<void>;
}

export const UPSERT_GUARD_STAT_SQL = `
INSERT INTO audit_guard_stats
  (guard_name, guard_phase, decision_kind, day, pack_id, count)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id)
DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count
`;

export interface CreatePostgresGuardFireStatsStoreDeps {
  readonly reader: PostgresReader;
  readonly writer: GuardStatsWriter;
}

export function createPostgresGuardFireStatsStore(
  deps: CreatePostgresGuardFireStatsStoreDeps,
): GuardFireStatsStore {
  return {
    async write(bucket) {
      const raw = bucket as unknown as Record<string, unknown>;
      const packId =
        typeof raw.packId === "string" && raw.packId.length > 0
          ? (raw.packId as string)
          : null;
      await deps.writer.upsertGuardStat({
        guardName: bucket.guardName,
        guardPhase: bucket.guardPhase,
        decisionKind: bucket.decisionKind,
        day: bucket.day,
        packId,
        countDelta: bucket.count,
      });
    },
    async readSince(since, packId) {
      const day = since.slice(0, 10);
      const params: unknown[] = [day];
      let where = "day >= $1";
      if (packId !== undefined) {
        params.push(packId);
        where += ` AND pack_id = $2`;
      }
      const rows = await deps.reader.query<GuardStatsRow>(
        `SELECT guard_name, guard_phase, decision_kind, day, count
         FROM audit_guard_stats
         WHERE ${where}`,
        params,
      );
      return rows.map((r) => ({
        guardName: r.guard_name,
        guardPhase: r.guard_phase,
        decisionKind: r.decision_kind,
        day:
          typeof r.day === "string"
            ? r.day.slice(0, 10)
            : r.day.toISOString().slice(0, 10),
        count: typeof r.count === "number" ? r.count : Number(r.count),
      }));
    },
  };
}
