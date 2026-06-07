import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  RedTeamHistoryQuerySchema,
  RedTeamHistoryResultSchema,
  RedTeamRunRecordSchema,
  RedTeamTrendPointSchema,
  type RedTeamHistoryQuery,
  type RedTeamHistoryResultParsed,
  type RedTeamRunRecordParsed,
  type RedTeamTrendPointParsed,
} from "../src/schemas/red-team-history.js";

/**
 * tRPC-level + schema coverage for the red-team history surface (ADR-133):
 * `governance.redTeamHistory` (per-pack run records + a defended/escaped/error
 * trend). Follows the established context-read posture — PRECONDITION_FAILED is
 * the runtime feature-detection signal when `ctx.redTeamHistory` is absent — and
 * mirrors the sibling `governance.redTeam`. The existing single-shot `redTeam`
 * procedure must keep working (no regression).
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({ store, emergencyStore, actor: null, ...ctx });
}

function summary(over: Partial<RedTeamRunRecordParsed["summary"]> = {}): RedTeamRunRecordParsed["summary"] {
  return {
    total: 6,
    defended: 6,
    escaped: 0,
    errors: 0,
    escapesByVector: { prompt_injection: 0, taint_escalation: 0, tool_scope_violation: 0 },
    ...over,
  };
}

function record(over: Partial<RedTeamRunRecordParsed> = {}): RedTeamRunRecordParsed {
  return {
    digest: "0xabc123",
    at: "2026-06-07T00:00:00.000Z",
    packId: "pack-payments-pix",
    summary: summary(),
    ...over,
  };
}

function trendPoint(over: Partial<RedTeamTrendPointParsed> = {}): RedTeamTrendPointParsed {
  return {
    at: "2026-06-07T00:00:00.000Z",
    packId: "pack-payments-pix",
    total: 6,
    defended: 6,
    escaped: 0,
    errors: 0,
    ...over,
  };
}

/**
 * A `redTeamHistory`-port stub whose `view(input)` filters by `packId` and
 * windows runs to `limit` — exactly the contract the console adopter implements
 * over a real `@adjudicate/red-team` history store's `view()`.
 */
function historyPort(
  runs: RedTeamRunRecordParsed[],
  trend: RedTeamTrendPointParsed[],
) {
  return {
    view(input: RedTeamHistoryQuery): RedTeamHistoryResultParsed {
      const scopedRuns = runs.filter(
        (r) => input.packId == null || r.packId === input.packId,
      );
      const scopedTrend = trend.filter(
        (p) => input.packId == null || p.packId === input.packId,
      );
      const windowedRuns =
        input.limit != null ? scopedRuns.slice(0, input.limit) : scopedRuns;
      return { runs: windowedRuns, trend: scopedTrend };
    },
  };
}

describe("RedTeamHistory* schemas (ADR-133)", () => {
  it("RedTeamRunRecordSchema round-trips a run record", () => {
    const parsed = RedTeamRunRecordSchema.parse(record({ digest: "0xdeadbeef" }));
    expect(parsed.digest).toBe("0xdeadbeef");
    expect(parsed.summary.defended).toBe(6);
  });

  it("RedTeamRunRecordSchema rejects a non-0x digest", () => {
    expect(RedTeamRunRecordSchema.safeParse(record({ digest: "abc123" })).success).toBe(false);
    expect(RedTeamRunRecordSchema.safeParse(record({ digest: "0xZZ" })).success).toBe(false);
  });

  it("RedTeamRunRecordSchema rejects a non-ISO `at`", () => {
    expect(RedTeamRunRecordSchema.safeParse(record({ at: "not-a-date" })).success).toBe(false);
  });

  it("RedTeamTrendPointSchema round-trips a trend point", () => {
    const parsed = RedTeamTrendPointSchema.parse(trendPoint({ escaped: 2 }));
    expect(parsed.escaped).toBe(2);
  });

  it("RedTeamHistoryResultSchema round-trips runs + trend", () => {
    const out = RedTeamHistoryResultSchema.parse({
      runs: [record(), record({ digest: "0xfeed01" })],
      trend: [trendPoint(), trendPoint({ at: "2026-06-07T01:00:00.000Z" })],
    });
    expect(out.runs).toHaveLength(2);
    expect(out.trend).toHaveLength(2);
  });

  it("RedTeamHistoryQuerySchema caps limit at 500 and rejects <= 0", () => {
    expect(RedTeamHistoryQuerySchema.parse({}).limit).toBeUndefined();
    expect(RedTeamHistoryQuerySchema.parse({ packId: "p", limit: 10 }).limit).toBe(10);
    expect(RedTeamHistoryQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
    expect(RedTeamHistoryQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("governance.redTeamHistory (ADR-133)", () => {
  it("returns runs + trend, no actor required", async () => {
    const runs = [
      record({ digest: "0x02", at: "2026-06-07T02:00:00.000Z" }),
      record({ digest: "0x01", at: "2026-06-07T01:00:00.000Z" }),
    ];
    const trend = [
      trendPoint({ at: "2026-06-07T01:00:00.000Z", defended: 5, escaped: 1 }),
      trendPoint({ at: "2026-06-07T02:00:00.000Z", defended: 6, escaped: 0 }),
    ];
    const caller = callerWith({ redTeamHistory: historyPort(runs, trend) });
    const out = await caller.governance.redTeamHistory({});
    expect(out.runs.map((r) => r.digest)).toEqual(["0x02", "0x01"]);
    expect(out.trend.map((p) => p.defended)).toEqual([5, 6]);
  });

  it("filters by packId", async () => {
    const runs = [
      record({ packId: "pack-payments-pix", digest: "0x0a" }),
      record({ packId: "pack-identity-kyc", digest: "0x0b" }),
    ];
    const trend = [
      trendPoint({ packId: "pack-payments-pix" }),
      trendPoint({ packId: "pack-identity-kyc" }),
    ];
    const caller = callerWith({ redTeamHistory: historyPort(runs, trend) });
    const out = await caller.governance.redTeamHistory({ packId: "pack-identity-kyc" });
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.packId).toBe("pack-identity-kyc");
    expect(out.trend.every((p) => p.packId === "pack-identity-kyc")).toBe(true);
  });

  it("honours `limit` by windowing the runs", async () => {
    const runs = Array.from({ length: 5 }, (_, i) =>
      record({ digest: `0x0${i}`, at: `2026-06-07T0${i}:00:00.000Z` }),
    );
    const caller = callerWith({ redTeamHistory: historyPort(runs, []) });
    const out = await caller.governance.redTeamHistory({ limit: 2 });
    expect(out.runs).toHaveLength(2);
  });

  it("PRECONDITION_FAILED when no history is wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.redTeamHistory({})).rejects.toThrow(
      /not configured/i,
    );
  });

  it("does not regress the single-shot governance.redTeam", async () => {
    const reportParsed = {
      pack: { id: "pack-payments-pix" },
      results: [],
      summary: summary(),
    };
    const caller = callerWith({ redTeamReport: reportParsed });
    const out = await caller.governance.redTeam();
    expect(out.pack.id).toBe("pack-payments-pix");
    // redTeam is independent of redTeamHistory.
    await expect(caller.governance.redTeamHistory({})).rejects.toThrow(
      /not configured/i,
    );
  });
});
