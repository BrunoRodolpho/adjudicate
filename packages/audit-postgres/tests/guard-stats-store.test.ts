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
  UPSERT_GUARD_STAT_SQL,
  createPostgresGuardFireStatsStore,
  type GuardStatsWriter,
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
