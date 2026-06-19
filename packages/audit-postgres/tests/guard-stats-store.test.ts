/**
 * 052 — guard-stats-store unit suite (the SQL/contract level the integration
 * suite proves against a live DB).
 *
 * The integration suite needs a live Postgres (PG_TEST_URL) and is env-skipped
 * in CI. This unit suite validates everything the substrate guarantees that does
 * NOT require a live DB:
 *   - the additive UPSERT SQL is the `count = count + EXCLUDED.count` template
 *     keyed on the migration-006 PK conflict target (no read-modify-write);
 *   - the no-pack case writes the empty-string sentinel, NOT NULL (so the PK
 *     arbiter matches deterministically and the additive upsert coalesces);
 *   - the migration-006 file actually declares that PK + `pack_id NOT NULL
 *     DEFAULT ''` (the arbiter the ON CONFLICT depends on);
 *   - the write-through delta + additive-store double round-trips with no
 *     over-count under repeated/concurrent writes.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GuardFireStats } from "@adjudicate/core";
import {
  RESERVE_GUARD_STAT_SQL,
  UPSERT_GUARD_STAT_SQL,
  createPostgresGuardFireStatsStore,
  createPostgresReservationStore,
  type GuardStatsWriter,
  type ReservationKey,
  type ReservationWriter,
} from "../src/guard-stats-store.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_006 = join(
  HERE,
  "..",
  "migrations",
  "006-add-guard-fire-stats.sql",
);

describe("UPSERT_GUARD_STAT_SQL — additive contract (052 T4)", () => {
  it("is the additive `count = count + EXCLUDED.count` upsert (not read-modify-write)", () => {
    const sql = UPSERT_GUARD_STAT_SQL.replace(/\s+/g, " ").trim();
    expect(sql).toContain(
      "ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id)",
    );
    expect(sql).toContain(
      "DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count",
    );
    // The accumulate is single-statement additive — NOT a SELECT-then-UPDATE.
    expect(sql).not.toMatch(/SELECT .* FROM audit_guard_stats/i);
  });

  it("the ON CONFLICT arbiter columns match the migration-006 PRIMARY KEY", () => {
    const migration = readFileSync(MIGRATION_006, "utf8");
    // The PK is the arbiter the additive ON CONFLICT targets — same 5 columns.
    expect(migration).toMatch(
      /PRIMARY KEY \(guard_name, guard_phase, decision_kind, day, pack_id\)/,
    );
    // 052 PK arbiter fix: pack_id is NOT NULL DEFAULT '' so the no-pack case has
    // a real key value (a NULL would defeat the additive arbiter / violate the
    // implicit NOT NULL of a PK column → silent 42P10/23502).
    expect(migration).toMatch(/pack_id\s+TEXT\s+NOT NULL DEFAULT ''/);
  });
});

describe("createPostgresGuardFireStatsStore — write path (052 T4)", () => {
  it("writes the empty-string sentinel for the no-pack case (NOT NULL)", async () => {
    const upsertGuardStat = vi.fn<GuardStatsWriter["upsertGuardStat"]>(
      async () => {},
    );
    const store = createPostgresGuardFireStatsStore({
      reader: { query: async () => [] },
      writer: { upsertGuardStat },
    });
    await store.write({
      guardName: "amount-threshold",
      guardPhase: "business",
      decisionKind: "EXECUTE",
      day: "2026-05-13",
      count: 1,
    });
    expect(upsertGuardStat).toHaveBeenCalledTimes(1);
    const arg = upsertGuardStat.mock.calls[0]![0]!;
    // The PK arbiter value, NOT null — the 052 fix.
    expect(arg.packId).toBe("");
    // The DELTA (count:1) is written, not a merged running total.
    expect(arg.countDelta).toBe(1);
  });

  it("passes a real packId through unchanged", async () => {
    const upsertGuardStat = vi.fn<GuardStatsWriter["upsertGuardStat"]>(
      async () => {},
    );
    const store = createPostgresGuardFireStatsStore({
      reader: { query: async () => [] },
      writer: { upsertGuardStat },
    });
    await store.write({
      guardName: "g",
      guardPhase: "auth",
      decisionKind: "REFUSE",
      day: "2026-05-13",
      count: 1,
      // packId rides on the bucket (resolvePackId path).
      ...({ packId: "pix" } as Record<string, unknown>),
    });
    expect(upsertGuardStat.mock.calls[0]![0]!.packId).toBe("pix");
  });
});

describe("write-through delta + additive double — no over-count (052 T3/T4)", () => {
  /**
   * Faithful double of the LIVE additive upsert: keyed on the SAME PK columns
   * (with the empty-string pack sentinel), `count = count + delta`. This lets the
   * unit suite exercise the per-call DELTA write discipline end-to-end without a
   * live DB — the integration suite proves the same against real Postgres.
   */
  function additiveDouble() {
    interface Row {
      guardName: string;
      guardPhase: string;
      decisionKind: string;
      day: string;
      packId: string;
      count: number;
    }
    const rows = new Map<string, Row>();
    const writer: GuardStatsWriter = {
      async upsertGuardStat(a) {
        const packId = a.packId ?? "";
        const k = `${a.guardName}|${a.guardPhase}|${a.decisionKind}|${a.day}|${packId}`;
        const prior = rows.get(k);
        // additive ON CONFLICT: count = count + delta
        rows.set(k, {
          guardName: a.guardName,
          guardPhase: a.guardPhase,
          decisionKind: a.decisionKind,
          day: a.day,
          packId,
          count: (prior?.count ?? 0) + a.countDelta,
        });
      },
    };
    return {
      store: createPostgresGuardFireStatsStore({
        // The reader reads the SAME accumulated rows back (the readSince path),
        // shaped like the SELECT in guard-stats-store.ts (snake_case columns).
        reader: {
          query: async <R>(_sql: string, params: readonly unknown[]) => {
            const sinceDay = String(params[0]);
            const packFilter =
              params.length > 1 ? String(params[1]) : undefined;
            return Array.from(rows.values())
              .filter((r) => r.day >= sinceDay)
              .filter((r) => (packFilter !== undefined ? r.packId === packFilter : true))
              .map((r) => ({
                guard_name: r.guardName,
                guard_phase: r.guardPhase,
                decision_kind: r.decisionKind,
                day: r.day,
                count: r.count,
              })) as unknown as readonly R[];
          },
        },
        writer,
      }),
      total: (key: string) => rows.get(key)?.count ?? 0,
    };
  }

  it("N delta-writes on one key converge on EXACTLY N (no triangular over-count)", async () => {
    const { store, total } = additiveDouble();
    const N = 40;
    await Promise.all(
      Array.from({ length: N }, () =>
        store.write({
          guardName: "amount-threshold",
          guardPhase: "business",
          decisionKind: "EXECUTE",
          day: "2026-05-13",
          count: 1,
        }),
      ),
    );
    expect(total("amount-threshold|business|EXECUTE|2026-05-13|")).toBe(N);
  });

  it("GuardFireStats over the additive store reads back the store total (no double-count)", async () => {
    const { store } = additiveDouble();
    const stats = new GuardFireStats({ store });
    // Two events on the same bucket: each writes a +1 DELTA; the additive store
    // aggregates to 2. queryAsync reads the store directly (no memory union).
    stats.recordOutcome({
      intentKind: "pix.refund.execute",
      decisionKind: "EXECUTE",
      basisCodes: ["business:rule_satisfied"],
      taint: "TRUSTED",
      durationMs: 1,
      intentHash: "a".repeat(64),
      guardId: "amount-threshold",
      guardName: "amount-threshold",
      guardPhase: "business",
      at: "2026-05-13T12:00:00.000Z",
    });
    stats.recordOutcome({
      intentKind: "pix.refund.execute",
      decisionKind: "EXECUTE",
      basisCodes: ["business:rule_satisfied"],
      taint: "TRUSTED",
      durationMs: 1,
      intentHash: "b".repeat(64),
      guardId: "amount-threshold",
      guardName: "amount-threshold",
      guardPhase: "business",
      at: "2026-05-13T12:00:00.000Z",
    });
    // Let the best-effort async store writes land.
    await new Promise((r) => setTimeout(r, 0));
    const out = await stats.queryAsync({ since: "2026-05-13T00:00:00.000Z" });
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(2); // NOT 3 (triangular) and NOT 4 (memory+store).
  });
});

// ── 053 — transactional reservation store (over-commit guard) ───────────────
//
// The integration suite proves `RESERVE_GUARD_STAT_SQL` against a LIVE DB and
// the real migration-006 PK arbiter. This unit suite covers the over-commit
// LOGIC that does not require a live DB (per the run-state note: the
// non-integration test MUST still cover the over-commit logic):
//   - the SQL is the additive ON CONFLICT template EXTENDED with the cap WHERE
//     guards (fresh-key SELECT…WHERE and conflict-path DO UPDATE…WHERE);
//   - `reserve` maps a 0-affected-row count to a fail-closed over_cap refusal;
//   - a non-positive / non-finite delta is refused locally (never fabricates
//     headroom) before any DB round-trip;
//   - against a FAITHFUL in-memory double of the exact single-statement
//     semantics, the cap is never over-committed — at the boundary, under
//     concurrency, and on a fresh-key over-cap first claim.
describe("RESERVE_GUARD_STAT_SQL — over-commit guard contract (053 T1)", () => {
  it("extends the additive ON CONFLICT template with the cap WHERE guards", () => {
    const sql = RESERVE_GUARD_STAT_SQL.replace(/\s+/g, " ").trim();
    // Same additive arbiter + DO UPDATE as the guard-stats template.
    expect(sql).toContain(
      "ON CONFLICT (guard_name, guard_phase, decision_kind, day, pack_id)",
    );
    expect(sql).toContain(
      "DO UPDATE SET count = audit_guard_stats.count + EXCLUDED.count",
    );
    // The over-commit guard on the CONFLICT path: refuse crossing the cap.
    expect(sql).toContain(
      "WHERE audit_guard_stats.count + EXCLUDED.count <= $7::bigint",
    );
    // The over-commit guard on the FRESH-KEY path: a first claim over the cap
    // selects no source row (a plain VALUES insert would skip the cap check).
    expect(sql).toContain(
      "SELECT $1, $2, $3, $4, $5, $6::bigint WHERE $6::bigint <= $7::bigint",
    );
    // Single-statement additive — NOT a SELECT-current-then-UPDATE RMW.
    expect(sql).not.toMatch(/SELECT count .* FROM audit_guard_stats/i);
  });
});

describe("createPostgresReservationStore — verdict mapping (053 T1)", () => {
  function keyFor(cap: number, packId: string | null = null): ReservationKey {
    return {
      guardName: "acct_7",
      guardPhase: "business",
      decisionKind: "EXECUTE",
      day: "2026-06-19",
      packId,
      cap,
    };
  }

  it("maps a 1-row affected count to reserved:true", async () => {
    const reserveGuardStat = vi.fn<ReservationWriter["reserveGuardStat"]>(
      async () => 1,
    );
    const store = createPostgresReservationStore({
      writer: { reserveGuardStat },
    });
    const out = await store.reserve(keyFor(10), 3);
    expect(out).toEqual({ reserved: true });
    // The cap + delta + '' sentinel reach the writer verbatim.
    expect(reserveGuardStat).toHaveBeenCalledTimes(1);
    const arg = reserveGuardStat.mock.calls[0]![0]!;
    expect(arg.cap).toBe(10);
    expect(arg.delta).toBe(3);
    expect(arg.packId).toBe(""); // 052 no-pack PK sentinel
  });

  it("maps a 0-row affected count to a fail-closed over_cap refusal", async () => {
    const reserveGuardStat = vi.fn<ReservationWriter["reserveGuardStat"]>(
      async () => 0,
    );
    const store = createPostgresReservationStore({
      writer: { reserveGuardStat },
    });
    const out = await store.reserve(keyFor(10), 3);
    expect(out).toEqual({ reserved: false, reason: "over_cap" });
  });

  it("refuses a non-positive / non-finite delta LOCALLY (never fabricates headroom, §C)", async () => {
    const reserveGuardStat = vi.fn<ReservationWriter["reserveGuardStat"]>(
      async () => 1,
    );
    const store = createPostgresReservationStore({
      writer: { reserveGuardStat },
    });
    for (const bad of [0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = await store.reserve(keyFor(10), bad);
      expect(out).toEqual({ reserved: false, reason: "invalid_delta" });
    }
    // None of those reached the DB — the over-commit guard is fail-closed even
    // before the round-trip.
    expect(reserveGuardStat).not.toHaveBeenCalled();
  });

  it("passes a real packId through unchanged", async () => {
    const reserveGuardStat = vi.fn<ReservationWriter["reserveGuardStat"]>(
      async () => 1,
    );
    const store = createPostgresReservationStore({
      writer: { reserveGuardStat },
    });
    await store.reserve(keyFor(10, "pix"), 1);
    expect(reserveGuardStat.mock.calls[0]![0]!.packId).toBe("pix");
  });

  it("a store/IO error on the write path PROPAGATES (aborts EXECUTE, never fails open §D-#6)", async () => {
    const reserveGuardStat = vi.fn<ReservationWriter["reserveGuardStat"]>(
      async () => {
        throw new Error("connection reset");
      },
    );
    const store = createPostgresReservationStore({
      writer: { reserveGuardStat },
    });
    // The store does NOT swallow the error into a phantom reserved:true — a
    // write-path failure must abort, not silently grant the reservation.
    await expect(store.reserve(keyFor(10), 1)).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("reservation over-commit — faithful single-statement double (053 T1)", () => {
  /**
   * Faithful in-memory double of `RESERVE_GUARD_STAT_SQL`'s EXACT single-
   * statement semantics — no read-modify-write window the way one atomic
   * Postgres statement has none:
   *   - fresh key: insert `delta` ONLY when `delta <= cap` (the SELECT…WHERE);
   *   - existing key: add `delta` ONLY when `count + delta <= cap`
   *     (the DO UPDATE…WHERE);
   *   - returns the affected-row count (1 on success, 0 on refusal).
   * Because JS is single-threaded and each `reserveGuardStat` runs its
   * read-and-write synchronously start-to-finish (no `await` between the cap
   * check and the mutation), interleaved Promise.all calls cannot observe a
   * stale total — exactly the atomicity the single Postgres statement provides.
   */
  function reservationDouble() {
    interface Row {
      count: number;
    }
    const rows = new Map<string, Row>();
    const writer: ReservationWriter = {
      // NOT async-bodied across the check/mutate: the whole verdict+write is one
      // synchronous critical section (mirrors the single SQL statement).
      reserveGuardStat(a) {
        const packId = a.packId ?? "";
        const k = `${a.guardName}|${a.guardPhase}|${a.decisionKind}|${a.day}|${packId}`;
        const prior = rows.get(k);
        if (prior === undefined) {
          // Fresh-key path: SELECT $6 WHERE $6 <= $7.
          if (a.delta > a.cap) return Promise.resolve(0);
          rows.set(k, { count: a.delta });
          return Promise.resolve(1);
        }
        // Conflict path: DO UPDATE … WHERE count + delta <= cap.
        if (prior.count + a.delta > a.cap) return Promise.resolve(0);
        prior.count += a.delta;
        return Promise.resolve(1);
      },
    };
    return {
      store: createPostgresReservationStore({ writer }),
      total: (cap: number, packId = ""): number =>
        rows.get(`acct_7|business|EXECUTE|2026-06-19|${packId}`)?.count ?? 0,
      keyFor: (cap: number, packId: string | null = null): ReservationKey => ({
        guardName: "acct_7",
        guardPhase: "business",
        decisionKind: "EXECUTE",
        day: "2026-06-19",
        packId,
        cap,
      }),
    };
  }

  it("reserves up to and including the cap, then refuses the next claim (boundary)", async () => {
    const { store, total, keyFor } = reservationDouble();
    const cap = 5;
    // Claim 1 unit five times → exactly at the cap.
    for (let i = 0; i < 5; i++) {
      expect(await store.reserve(keyFor(cap), 1)).toEqual({ reserved: true });
    }
    expect(total(cap)).toBe(5);
    // The 6th claim would cross the cap → fail-closed over_cap, total unchanged.
    expect(await store.reserve(keyFor(cap), 1)).toEqual({
      reserved: false,
      reason: "over_cap",
    });
    expect(total(cap)).toBe(5);
  });

  it("a multi-unit claim that would cross the cap is refused atomically (no partial reserve)", async () => {
    const { store, total, keyFor } = reservationDouble();
    const cap = 10;
    expect(await store.reserve(keyFor(cap), 7)).toEqual({ reserved: true });
    expect(total(cap)).toBe(7);
    // 7 + 5 = 12 > 10 → refused; the store does NOT partially reserve 3.
    expect(await store.reserve(keyFor(cap), 5)).toEqual({
      reserved: false,
      reason: "over_cap",
    });
    expect(total(cap)).toBe(7);
    // 7 + 3 = 10 == cap → allowed (the cap value itself is reservable).
    expect(await store.reserve(keyFor(cap), 3)).toEqual({ reserved: true });
    expect(total(cap)).toBe(10);
  });

  it("a FRESH-KEY first claim over the cap is refused (the SELECT…WHERE gate)", async () => {
    const { store, total, keyFor } = reservationDouble();
    // No prior row — a first claim of 11 against cap 10 must NOT land a row.
    expect(await store.reserve(keyFor(10), 11)).toEqual({
      reserved: false,
      reason: "over_cap",
    });
    expect(total(10)).toBe(0); // nothing reserved — the fresh-key over-cap hole is closed
  });

  it("N concurrent single-unit claims never over-commit a cap of N (one wins per unit)", async () => {
    const { store, total, keyFor } = reservationDouble();
    const cap = 50;
    const attempts = 200; // 4× the cap of contending claims
    const outcomes = await Promise.all(
      Array.from({ length: attempts }, () => store.reserve(keyFor(cap), 1)),
    );
    const reserved = outcomes.filter((o) => o.reserved).length;
    const refused = outcomes.filter((o) => !o.reserved).length;
    // EXACTLY `cap` claims win; the rest are refused — no over-commit.
    expect(reserved).toBe(cap);
    expect(refused).toBe(attempts - cap);
    expect(total(cap)).toBe(cap); // the durable total is exactly the cap, never over
  });

  it("two concurrent claims at cap−1 do NOT both win (the TOCTOU race the durable form closes)", async () => {
    const { store, total, keyFor } = reservationDouble();
    const cap = 5;
    // Pre-reserve cap−1 = 4.
    expect(await store.reserve(keyFor(cap), 4)).toEqual({ reserved: true });
    expect(total(cap)).toBe(4);
    // Two concurrent claims of 1 each: only ONE can fit in the last slot.
    const [a, b] = await Promise.all([
      store.reserve(keyFor(cap), 1),
      store.reserve(keyFor(cap), 1),
    ]);
    const wins = [a, b].filter((o) => o.reserved).length;
    expect(wins).toBe(1); // the park-counter TOCTOU race would let BOTH win
    expect(total(cap)).toBe(5); // exactly at cap, never 6
  });
});
