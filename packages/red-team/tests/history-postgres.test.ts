/**
 * Postgres-backed red-team run-history store (ADR-133 durable variant).
 * Write-through cache: sync reads from a per-pack ring, fire-and-forget upserts,
 * idempotent on (pack_id, digest). Tested with a fake SqlExecutor.
 */
import { describe, expect, it } from "vitest";
import {
  createPostgresRedTeamHistoryStore,
  redTeamRunsDDL,
  type SqlExecutor,
} from "../src/history-postgres.js";
import { digestRedTeamReport } from "../src/history.js";
import type { RedTeamReport } from "../src/runner.js";

/** A fake SqlExecutor recording writes; returns canned rows for SELECTs. */
function fakeSql(selectRows: Record<string, unknown>[] = []): SqlExecutor & {
  calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }>;
} {
  const calls: Array<{ sql: string; params?: ReadonlyArray<unknown> }> = [];
  return {
    calls,
    async query<T>(sql: string, params?: ReadonlyArray<unknown>) {
      calls.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return { rows: selectRows as T[] };
      return { rows: [] as T[] };
    },
  };
}

function report(over: Partial<RedTeamReport> = {}): RedTeamReport {
  return {
    pack: { id: "stub" },
    results: [
      { name: "pi-1", vector: "prompt_injection", status: "defended", acceptable: ["REFUSE"] },
      { name: "te-1", vector: "taint_escalation", status: "defended", acceptable: ["REFUSE"] },
    ],
    summary: {
      total: 2,
      defended: 2,
      escaped: 0,
      errors: 0,
      escapesByVector: { prompt_injection: 0, taint_escalation: 0, tool_scope_violation: 0 },
    },
    ...over,
  };
}

const AT = "2026-06-07T00:00:00.000Z";

describe("redTeamRunsDDL", () => {
  it("creates the table with UNIQUE(pack_id, digest)", () => {
    const ddl = redTeamRunsDDL();
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS red_team_runs");
    expect(ddl).toMatch(/UNIQUE \(pack_id, digest\)/);
  });
});

describe("createPostgresRedTeamHistoryStore", () => {
  it("init() self-provisions the table (idempotent DDL) BEFORE the SELECT load", async () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql });
    await store.init();
    const ddlIdx = sql.calls.findIndex((c) =>
      /CREATE TABLE IF NOT EXISTS red_team_runs/.test(c.sql),
    );
    const selIdx = sql.calls.findIndex((c) => /^\s*SELECT/i.test(c.sql));
    expect(ddlIdx).toBe(0); // DDL runs first
    expect(ddlIdx).toBeLessThan(selIdx); // before the cache-loading SELECT
  });

  // #28-7: the init scan is bounded PER pack by a row_number() window, then
  // re-sorted ASC so the FIFO ring still receives oldest→newest.
  it("init() bounds the scan with a per-pack row_number() window + outer ASC", async () => {
    const sql = fakeSql();
    await createPostgresRedTeamHistoryStore({ sql, capacity: 7 }).init();
    const select = sql.calls.find((c) => /^\s*SELECT/i.test(c.sql))!.sql;
    expect(select).toMatch(/row_number\(\) OVER \(PARTITION BY pack_id ORDER BY at DESC\)/);
    expect(select).toMatch(/rn <= 7/);
    expect(select).toMatch(/ORDER BY at ASC/);
  });

  it("record → sync view + fire-and-forget upsert (ON CONFLICT DO NOTHING)", async () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql });
    store.record(report(), AT);
    const view = store.view();
    expect(view.runs).toHaveLength(1);
    expect(view.runs[0]!.packId).toBe("stub");
    expect(view.runs[0]!.digest).toBe(digestRedTeamReport(report()));
    expect(view.trend).toHaveLength(1);
    expect(view.trend[0]).toMatchObject({ packId: "stub", total: 2, defended: 2 });
    await new Promise((r) => setTimeout(r, 0));
    const insert = sql.calls.find((c) => /INSERT INTO red_team_runs/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.sql).toMatch(/ON CONFLICT \(pack_id, digest\) DO NOTHING/);
  });

  it("is idempotent on (packId, digest) — re-record is a cache no-op", () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql });
    store.record(report(), AT);
    store.record(report(), "2026-06-08T00:00:00.000Z"); // same content, later stamp
    expect(store.view().runs).toHaveLength(1);
  });

  it("records a distinct digest when content changes (a regression point)", () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql });
    store.record(report(), AT);
    store.record(
      report({
        results: [
          { name: "pi-1", vector: "prompt_injection", status: "escaped", acceptable: ["REFUSE"] },
          { name: "te-1", vector: "taint_escalation", status: "defended", acceptable: ["REFUSE"] },
        ],
        summary: {
          total: 2,
          defended: 1,
          escaped: 1,
          errors: 0,
          escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
        },
      }),
      "2026-06-09T00:00:00.000Z",
    );
    expect(store.view().runs).toHaveLength(2);
  });

  it("init() loads rows from Postgres, preserving the persisted digest", async () => {
    const sql = fakeSql([
      {
        pack_id: "stub",
        digest: "0xpersisted",
        at: "2026-06-07T00:00:00.000Z",
        summary_jsonb: { total: 2, defended: 2, escaped: 0, errors: 0, escapesByVector: {} },
      },
    ]);
    const store = createPostgresRedTeamHistoryStore({ sql });
    await store.init();
    const view = store.view();
    expect(view.runs).toHaveLength(1);
    // Persisted digest is kept verbatim (not re-derived).
    expect(view.runs[0]!.digest).toBe("0xpersisted");
    expect(view.trend[0]).toMatchObject({ defended: 2 });
  });

  it("bounds each pack ring at capacity (FIFO)", () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql, capacity: 2 });
    for (let i = 0; i < 4; i++) {
      // Distinct content per run so each yields a fresh digest.
      store.record(
        report({ results: [{ name: `r-${i}`, vector: "prompt_injection", status: "defended", acceptable: ["REFUSE"] }] }),
        `2026-06-0${i + 1}T00:00:00.000Z`,
      );
    }
    expect(store.view().runs).toHaveLength(2);
  });

  it("reset() clears the ring and issues a DELETE", async () => {
    const sql = fakeSql();
    const store = createPostgresRedTeamHistoryStore({ sql });
    store.record(report(), AT);
    store.reset();
    expect(store.view().runs).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(sql.calls.some((c) => /DELETE FROM red_team_runs/.test(c.sql))).toBe(true);
  });
});
