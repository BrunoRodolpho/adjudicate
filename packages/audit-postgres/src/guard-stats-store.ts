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
import { coerceBigIntCount } from "./pg-types.js";

interface GuardStatsRow {
  guard_name: string;
  guard_phase: GuardPhase;
  decision_kind: GuardFireBucket["decisionKind"];
  day: string | Date;
  // migration-006 `count BIGINT` — drivers materialize as string (precision-
  // safe) or number; coerced through `coerceBigIntCount` (053, T2: aligned row
  // types). `bigint` is also accepted by the coercer for drivers configured to
  // return native bigint.
  count: string | number | bigint;
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

// ── 053 — reservation store contract ────────────────────────────────────────

/**
 * Identifies one (resource, horizon) reservation row. The 5 fields are the
 * migration-006 PRIMARY KEY (the `ON CONFLICT` arbiter); `cap` is the inclusive
 * cumulative/velocity limit the reservation may not cross.
 *
 * The natural key reuses the guard-stats columns: a reservation against an
 * account-daily cap is, e.g., `{ guardName: "acct_7", guardPhase: "business",
 * decisionKind: "EXECUTE", day: "2026-06-19", packId: "pix" }`. Adopters choose
 * the encoding; the store treats them as opaque key parts.
 */
export interface ReservationKey {
  readonly guardName: string;
  readonly guardPhase: GuardPhase;
  readonly decisionKind: GuardFireBucket["decisionKind"];
  readonly day: string;
  /**
   * 052 — `''` is the no-pack PK sentinel (NOT NULL). A NULL would violate the
   * PK column NOT NULL (23502) or — treated as DISTINCT — split the arbiter so
   * the additive upsert duplicates rows. The store coerces a null/empty packId
   * to `''` so the reservation arbiter matches deterministically.
   */
  readonly packId: string | null;
  /** Inclusive cap for this horizon. A claim that would push the running
   *  reserved total over `cap` is REFUSED (fail-closed, single statement). */
  readonly cap: number;
}

/**
 * Adopter-implemented atomic reservation writer. Runs `RESERVE_GUARD_STAT_SQL`
 * (or its equivalent) and returns the affected row count: `1` when the `delta`
 * units were reserved, `0` when the claim would cross the cap (refused). The
 * caller MUST surface a non-positive count as a refusal — the over-commit guard
 * is the `rowCount === 0` signal, not an exception.
 */
export interface ReservationWriter {
  reserveGuardStat(args: {
    readonly guardName: string;
    readonly guardPhase: GuardPhase;
    readonly decisionKind: GuardFireBucket["decisionKind"];
    readonly day: string;
    readonly packId: string;
    readonly delta: number;
    readonly cap: number;
  }): Promise<number>;
}

/**
 * Outcome of a reservation claim. `reserved: true` ⇒ the `delta` units were
 * committed atomically (the row's running total stays ≤ cap). `reserved: false`
 * ⇒ the claim was REFUSED because it would cross the cap (or `delta` was
 * non-positive / `delta > cap`) — the durable over-commit guard fired.
 */
export type ReservationOutcome =
  | { readonly reserved: true }
  | { readonly reserved: false; readonly reason: "over_cap" | "invalid_delta" };

export interface CreatePostgresReservationStoreDeps {
  readonly writer: ReservationWriter;
}

/**
 * Durable, transactional reservation store. EXTENDS the additive guard-stats
 * upsert template with an over-commit guard so a cumulative/velocity cap can be
 * decremented (claimed) under concurrency WITHOUT over-commit.
 *
 * `reserve(key, delta)` runs ONE atomic statement (`RESERVE_GUARD_STAT_SQL`):
 *   - `delta <= 0` is rejected locally (`invalid_delta`) — a non-positive claim
 *     would fabricate headroom (§C: never decrease friction); it never reaches
 *     the DB.
 *   - otherwise the writer's affected-row count is the verdict: `1` ⇒ reserved,
 *     `0` ⇒ over-cap refusal. There is NO read-modify-write window — concurrent
 *     over-cap claims cannot both win.
 *
 * IMPURE-SHELL ONLY (§D): this is store IO that happens AFTER the pure kernel
 * decision. It never enters `adjudicate()`; a refused claim is rolled back
 * through the existing rate-limit rollback closure in the kernel shell, and a
 * store/IO error on the write path aborts EXECUTE (it propagates — the caller's
 * await rejects — rather than failing open).
 */
export function createPostgresReservationStore(
  deps: CreatePostgresReservationStoreDeps,
): {
  reserve(key: ReservationKey, delta: number): Promise<ReservationOutcome>;
} {
  return {
    async reserve(key, delta) {
      // §C: a non-integer or non-positive delta can never CLAIM headroom — it
      // would either be a no-op or, if negative, fabricate cap room. A FRACTIONAL
      // delta in (0,0.5] casts to `$6::bigint` and Postgres rounds it to ZERO
      // units, so a zero-unit INSERT would return rowCount===1 and report a
      // phantom reserved:true (fail-OPEN headroom fabrication). `Number.isInteger`
      // also subsumes the finite check (NaN/Infinity are non-integers). Refuse it
      // locally, fail-closed, before any DB round-trip.
      if (!Number.isInteger(delta) || delta <= 0) {
        return { reserved: false, reason: "invalid_delta" };
      }
      // 052 — coerce the no-pack case to the '' PK sentinel (NOT NULL), so the
      // reservation arbiter matches deterministically (a NULL would 23502 or
      // split the arbiter into duplicate rows).
      const packId =
        typeof key.packId === "string" && key.packId.length > 0
          ? key.packId
          : "";
      const affected = await deps.writer.reserveGuardStat({
        guardName: key.guardName,
        guardPhase: key.guardPhase,
        decisionKind: key.decisionKind,
        day: key.day,
        packId,
        delta,
        cap: key.cap,
      });
      // The over-commit guard: the single-statement affected-row count is the
      // authority. 0 rows ⇒ the claim would cross the cap (or delta > cap) ⇒
      // REFUSED. Any positive count ⇒ the units were reserved atomically.
      return affected > 0
        ? { reserved: true }
        : { reserved: false, reason: "over_cap" };
    },
  };
}

export const UPSERT_GUARD_STAT_SQL = `
INSERT INTO audit_guard_stats
  (guard_name, guard_phase, decision_kind, day, pack_id, count)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id)
DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count
`;

// ── 053 — transactional reservation upsert (over-commit guard) ──────────────
//
// A reservation decrement claims `count` units of a multi-horizon cumulative/
// velocity cap atomically. It EXTENDS the additive guard-stats template above
// (same `audit_guard_stats` table, same migration-006 PK arbiter — NO new
// migration) with TWO cap gates so over-commit fails closed in ONE statement:
// a fresh-key `SELECT … WHERE $delta <= $cap` source gate AND a conflict-path
// `WHERE table.count + EXCLUDED.count <= $cap` predicate on the `DO UPDATE`.
//
//   INSERT … SELECT $delta WHERE $delta <= $cap   -- fresh-key cap gate
//   ON CONFLICT (… the PK …)
//   DO UPDATE SET count = table.count + EXCLUDED.count
//   WHERE table.count + EXCLUDED.count <= $cap     -- conflict-path cap gate
//
// Semantics (the load-bearing over-commit guard):
//   - `count` is the RUNNING RESERVED total for the (resource, horizon) key.
//   - `$6` ($delta) is the units THIS reservation claims (≥ 0).
//   - `$7` ($cap) is the inclusive cap for the horizon.
//   - The FRESH-KEY claim is gated by the `INSERT … SELECT … WHERE $6 <= $7`
//     source: a first claim that ALREADY exceeds the cap selects ZERO source
//     rows, so nothing is inserted and `rowCount === 0` → REFUSED. (A plain
//     `INSERT … VALUES` would land unconditionally and skip the cap check on
//     the fresh-key path — the over-commit hole this `SELECT … WHERE` closes.)
//   - The CONFLICT-PATH claim is gated by the `WHERE table.count +
//     EXCLUDED.count <= $cap` predicate: the additive `DO UPDATE` applies ONLY
//     when the post-claim total stays at-or-under the cap. If the claim WOULD
//     cross the cap, the `DO UPDATE` matches zero rows → `rowCount === 0` →
//     REFUSED.
//   - Either way, `rowCount === 0` is the SINGLE-statement, race-free signal
//     that the reservation was refused (fail-closed, §D-#6 / §C: over-cap
//     raises friction, never silently over-commits). `rowCount === 1` means the
//     `$delta` units were reserved atomically.
//
// 052/053 — the `ON CONFLICT` arbiter MUST be a real `UNIQUE`/`PK` (the
// migration-006 PK) exercised against a LIVE DB. If the conflict target is not
// backed by a real constraint, every write fails Postgres `42P10` undetected
// and the cap is UNENFORCED — the integration test in §6 exercises the real PK,
// not just this SQL string.
//
// WHY NOT the ephemeral park `INCR→EXPIRE→check→DECR` (defer-park.ts): that
// sequence has a documented TOCTOU over-commit race (two concurrent claims at
// `cap − 1` both pass before either rolls back). This durable upsert is atomic/
// coalescing in ONE statement — no read-modify-write, no `INCR→check→DECR`
// window — so concurrent over-cap claims cannot both win (one updates/inserts,
// the other's `WHERE` matches zero rows). See defer-park.ts:174 for the
// contrast.
// `$6` (delta) and `$7` (cap) are explicitly cast to `bigint`: `$6` is used both
// as the `count` column source AND inside the `$6 <= $7` comparison, and `$7`
// appears ONLY in comparisons — without the casts Postgres cannot deduce a
// single consistent type for the parameter ("inconsistent types deduced for
// parameter $6"). The casts pin both to `bigint`, matching the `count BIGINT`
// column the arbiter accumulates.
export const RESERVE_GUARD_STAT_SQL = `
INSERT INTO audit_guard_stats
  (guard_name, guard_phase, decision_kind, day, pack_id, count)
SELECT $1, $2, $3, $4, $5, $6::bigint WHERE $6::bigint <= $7::bigint
ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id)
DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count
WHERE audit_guard_stats.count + EXCLUDED.count <= $7::bigint
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
        // 053/T2 — coerce the shared `count BIGINT` through the typed helper so
        // the guard-stats reader and the reservation store agree on the column
        // shape (string | number | bigint → safe-integer number, loud on loss).
        count: coerceBigIntCount(r.count, "count"),
      }));
    },
  };
}
