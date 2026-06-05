/**
 * GuardFireStats — in-memory accumulator + persistent-store union.
 *
 * Pins:
 *   - record() coalesces (guardName, guardPhase, decisionKind, day) into a single bucket
 *   - query() applies the `since` cutoff in day granularity
 *   - packId filter is respected when resolvePackId is supplied
 *   - queryAsync unions persistent reads with in-memory state
 *   - missing guardName/guardPhase → event is dropped (no bucket for default-phase decisions)
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  GuardFireStats,
  type GuardFireBucket,
  type GuardFireStatsStore,
  type LearningEvent,
} from "../../src/kernel/index.js";
import {
  _resetMetricsSink,
  setMetricsSink,
} from "../../src/kernel/metrics.js";

function event(overrides: Partial<LearningEvent> = {}): LearningEvent {
  return {
    intentKind: "pix.refund.execute",
    decisionKind: "EXECUTE",
    basisCodes: ["state:transition_valid"],
    taint: "TRUSTED",
    durationMs: 4,
    intentHash: "a".repeat(64),
    guardId: "amount-threshold",
    guardName: "amount-threshold",
    guardPhase: "business",
    at: "2026-05-13T12:00:00.000Z",
    ...overrides,
  };
}

/**
 * Faithful in-memory double of the ADDITIVE persistent store (mirrors
 * audit-postgres UPSERT_GUARD_STAT_SQL): `write` adds the delta to the per-key
 * total; `readSince` returns the aggregated rows newer-than the day cutoff.
 * Using a real write-through double (rather than a no-op `write` + hardcoded
 * `readSince`) is what makes these tests exercise the round-trip and catch the
 * over-count.
 */
function writeThroughStore(): GuardFireStatsStore & {
  seed: (b: GuardFireBucket) => void;
} {
  const rows = new Map<string, GuardFireBucket>();
  const key = (b: GuardFireBucket): string =>
    `${b.guardName}|${b.guardPhase}|${b.decisionKind}|${b.day}`;
  const add = (b: GuardFireBucket): void => {
    const k = key(b);
    const prior = rows.get(k);
    rows.set(k, prior ? { ...prior, count: prior.count + b.count } : { ...b });
  };
  return {
    write: add,
    readSince: (since) =>
      Array.from(rows.values()).filter((b) => b.day >= since.slice(0, 10)),
    seed: add,
  };
}

describe("GuardFireStats — in-memory accumulator", () => {
  it("coalesces same (name, phase, kind, day) into one bucket", () => {
    const stats = new GuardFireStats();
    stats.recordOutcome(event());
    stats.recordOutcome(event({ intentHash: "b".repeat(64) }));
    stats.recordOutcome(event({ intentHash: "c".repeat(64) }));
    const buckets = stats.query({ since: "2026-05-13T00:00:00.000Z" });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual<GuardFireBucket>({
      guardName: "amount-threshold",
      guardPhase: "business",
      decisionKind: "EXECUTE",
      day: "2026-05-13",
      count: 3,
    });
  });

  it("buckets per day separately", () => {
    const stats = new GuardFireStats();
    stats.recordOutcome(event());
    stats.recordOutcome(event({ at: "2026-05-14T08:00:00.000Z" }));
    const buckets = stats.query({ since: "2026-05-13T00:00:00.000Z" });
    expect(buckets).toHaveLength(2);
    expect(new Set(buckets.map((b) => b.day))).toEqual(
      new Set(["2026-05-13", "2026-05-14"]),
    );
  });

  it("applies the `since` cutoff at day granularity", () => {
    const stats = new GuardFireStats();
    stats.recordOutcome(event({ at: "2026-05-10T12:00:00.000Z" }));
    stats.recordOutcome(event({ at: "2026-05-13T12:00:00.000Z" }));
    const buckets = stats.query({ since: "2026-05-12T00:00:00.000Z" });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.day).toBe("2026-05-13");
  });

  it("drops events without guardName or guardPhase (default-phase decisions)", () => {
    const stats = new GuardFireStats();
    stats.recordOutcome(event({ guardName: undefined, guardPhase: undefined }));
    expect(stats.query({ since: "2026-05-13T00:00:00.000Z" })).toHaveLength(0);
  });

  it("packId filter respects resolvePackId", () => {
    const stats = new GuardFireStats({
      resolvePackId: (kind) => (kind.startsWith("pix.") ? "pix" : "kyc"),
    });
    stats.recordOutcome(event({ intentKind: "pix.refund.execute" }));
    stats.recordOutcome(event({ intentKind: "kyc.start.defer" }));
    expect(
      stats.query({ since: "2026-05-13T00:00:00.000Z", packId: "pix" }),
    ).toHaveLength(1);
    expect(
      stats.query({ since: "2026-05-13T00:00:00.000Z", packId: "kyc" }),
    ).toHaveLength(1);
    expect(
      stats.query({ since: "2026-05-13T00:00:00.000Z" }),
    ).toHaveLength(2);
  });

  it("queryAsync returns the durable store total across days (write-through, no double-count)", async () => {
    const store = writeThroughStore();
    // Prior history already aggregated in the store (e.g. a previous process).
    store.seed({
      guardName: "amount-threshold",
      guardPhase: "business",
      decisionKind: "EXECUTE",
      day: "2026-05-12",
      count: 7,
    });
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event()); // day 2026-05-13 → +1 delta written to the store
    const out = await stats.queryAsync({ since: "2026-05-12T00:00:00.000Z" });
    const sorted = [...out].sort((a, b) => a.day.localeCompare(b.day));
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toMatchObject({ day: "2026-05-12", count: 7 });
    // NOT 2 (would be 1 from memory + 1 written-through to the store).
    expect(sorted[1]).toMatchObject({ day: "2026-05-13", count: 1 });
  });

  it("queryAsync does NOT double-count write-through events on the same key (regression)", async () => {
    const store = writeThroughStore();
    // 4 events of prior history already aggregated in the store.
    store.seed({
      guardName: "amount-threshold",
      guardPhase: "business",
      decisionKind: "EXECUTE",
      day: "2026-05-13",
      count: 4,
    });
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event()); // +1 delta → store 5
    stats.recordOutcome(event({ intentHash: "f".repeat(64) })); // +1 delta → store 6
    const out = await stats.queryAsync({ since: "2026-05-13T00:00:00.000Z" });
    expect(out).toHaveLength(1);
    // 4 prior + 2 new deltas = 6. The OLD code wrote the cumulative `merged`
    // to the additive store (4+1+2 = 7) AND summed in-memory (2) → 9.
    expect(out[0]!.count).toBe(6);
  });
});

describe("GuardFireStats — store write failure telemetry (ConcurrencyReviewer-009)", () => {
  afterEach(() => _resetMetricsSink());

  it("routes async store.write rejection to recordSinkFailure", async () => {
    const failures: Array<{ sink: string; subject: string }> = [];
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push({ sink: e.sink, subject: e.subject });
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const store: GuardFireStatsStore = {
      write: () => Promise.reject(new Error("pg down")),
      readSince: () => [],
    };
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event()); // must not throw
    // Give the microtask queue one tick so the async .catch fires.
    await new Promise((r) => setTimeout(r, 0));
    expect(failures).toHaveLength(1);
    expect(failures[0]!.sink).toBe("guard-fire-stats");
    expect(failures[0]!.subject).toBe("amount-threshold");
  });

  it("routes sync store.write throw to recordSinkFailure (no throw to caller)", () => {
    const failures: Array<{ sink: string; subject: string }> = [];
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push({ sink: e.sink, subject: e.subject });
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const store: GuardFireStatsStore = {
      write: () => {
        throw new Error("sync throw");
      },
      readSince: () => [],
    };
    const stats = new GuardFireStats({ store });
    expect(() => stats.recordOutcome(event())).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.sink).toBe("guard-fire-stats");
    expect(failures[0]!.subject).toBe("amount-threshold");
  });

  it("does not emit telemetry when the store write succeeds", () => {
    let calls = 0;
    setMetricsSink({
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure() {
        calls += 1;
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    });
    const store: GuardFireStatsStore = {
      write: () => {},
      readSince: () => [],
    };
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event());
    expect(calls).toBe(0);
  });
});
