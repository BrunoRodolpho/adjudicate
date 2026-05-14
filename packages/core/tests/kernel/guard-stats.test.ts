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

import { describe, expect, it } from "vitest";
import {
  GuardFireStats,
  type GuardFireBucket,
  type GuardFireStatsStore,
  type LearningEvent,
} from "../../src/kernel/index.js";

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

  it("queryAsync unions persistent-store reads with in-memory", async () => {
    const stored: GuardFireBucket[] = [
      {
        guardName: "amount-threshold",
        guardPhase: "business",
        decisionKind: "EXECUTE",
        day: "2026-05-12",
        count: 7,
      },
    ];
    const store: GuardFireStatsStore = {
      write: () => {},
      readSince: () => stored,
    };
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event()); // day 2026-05-13
    const out = await stats.queryAsync({ since: "2026-05-12T00:00:00.000Z" });
    // Two distinct day buckets, untouched counts.
    const sorted = [...out].sort((a, b) => a.day.localeCompare(b.day));
    expect(sorted).toHaveLength(2);
    expect(sorted[0]).toMatchObject({ day: "2026-05-12", count: 7 });
    expect(sorted[1]).toMatchObject({ day: "2026-05-13", count: 1 });
  });

  it("queryAsync coalesces store + memory rows that share the same key", async () => {
    const stored: GuardFireBucket[] = [
      {
        guardName: "amount-threshold",
        guardPhase: "business",
        decisionKind: "EXECUTE",
        day: "2026-05-13",
        count: 4,
      },
    ];
    const store: GuardFireStatsStore = {
      write: () => {},
      readSince: () => stored,
    };
    const stats = new GuardFireStats({ store });
    stats.recordOutcome(event());
    stats.recordOutcome(event({ intentHash: "f".repeat(64) }));
    const out = await stats.queryAsync({ since: "2026-05-13T00:00:00.000Z" });
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(6); // 4 from store + 2 from memory
  });
});
