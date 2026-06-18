/**
 * Postgres-backed GuardFireStatsStore. Plugs into core's `GuardFireStats`
 * accumulator so guard-fire counters survive restarts.
 *
 * Writes are UPSERTs that add to the per-day natural key. The natural key is
 * `(guard_name, guard_phase, decision_kind, day, pack_id)` and IS the
 * migration-006 PRIMARY KEY arbiter the additive `ON CONFLICT` targets.
 *
 * 052 — `pack_id` is `NOT NULL DEFAULT ''` (migration 006): the default
 * (no-pack) accumulator writes the empty-string sentinel, NOT NULL. A NULL
 * `pack_id` would (a) violate the PK column's implicit NOT NULL (Postgres 23502)
 * and (b) — since Postgres treats NULL as DISTINCT in PK/unique arbiters —
 * prevent the `ON CONFLICT` from ever matching two no-pack rows, so the upsert
 * would INSERT duplicates instead of aggregating (the over-count failure). The
 * empty-string sentinel makes the arbiter deterministic and the additive upsert
 * atomic/coalescing for every write, with or without a pack.
 *
 * Reads return rows newer-than the supplied ISO `since`, optionally
 * filtered by pack.
 */

import type {
  GuardFireBucket,
  GuardFireStatsStore,
  GuardPhase,
} from "@adjudicate/core";
import type { PostgresReader } from "./pg-reader.js";

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
      // 052: the no-pack case writes the empty-string sentinel, NOT NULL — it is
      // the PK arbiter value migration-006 declares (`pack_id NOT NULL DEFAULT
      // ''`). Passing NULL here would either violate the PK column NOT NULL
      // (23502) or, treated as DISTINCT, defeat the additive `ON CONFLICT`
      // arbiter so the upsert duplicates rows instead of coalescing them.
      const packId =
        typeof raw.packId === "string" && raw.packId.length > 0
          ? (raw.packId as string)
          : "";
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
