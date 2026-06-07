import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { createInMemoryEmergencyStateStore } from "../src/store/emergency-store.js";
import { createAdminCaller } from "../src/trpc/index.js";
import {
  DriftHistoryEntrySchema,
  DriftHistoryQuerySchema,
  DriftHistoryResultSchema,
  type DriftHistoryEntryParsed,
  type DriftHistoryQuery,
  type DriftHistoryResultParsed,
} from "../src/schemas/behavioral-drift.js";

/**
 * tRPC-level + schema coverage for the drift-history surface (ADR-132):
 * `governance.driftHistory` (bounded TVD/alert time-series). Follows the
 * established context-read posture — PRECONDITION_FAILED is the runtime
 * feature-detection signal when `ctx.driftHistory` is absent — and exactly
 * mirrors the sibling `governance.behavioralDrift`. The existing single-point
 * `behavioralDrift` procedure must keep working (no regression).
 */

const store = createInMemoryAuditStore({ records: [] });
const emergencyStore = createInMemoryEmergencyStateStore();

function callerWith(ctx: Partial<Parameters<typeof createAdminCaller>[0]>) {
  return createAdminCaller({
    store,
    emergencyStore,
    actor: null,
    ...ctx,
  });
}

function entry(over: Partial<DriftHistoryEntryParsed> = {}): DriftHistoryEntryParsed {
  return {
    at: "2026-06-07T00:00:00.000Z",
    seq: 0,
    totalObserved: 4,
    maxTvd: 0,
    alertCount: 0,
    dimensions: [{ dimension: "decision.kind", tvd: 0, alertCount: 0 }],
    ...over,
  };
}

/**
 * A `DriftHistory`-port stub whose `query(input)` honours `limit` by returning
 * the LAST N entries — exactly the contract the console adopter implements over
 * a real `@adjudicate/drift` `DriftHistory.view()`.
 */
function historyPort(
  entries: DriftHistoryEntryParsed[],
  meta: { capacity?: number; dropped?: number } = {},
) {
  const capacity = meta.capacity ?? 100;
  const dropped = meta.dropped ?? 0;
  return {
    query(input: DriftHistoryQuery): DriftHistoryResultParsed {
      const windowed = entries.slice(-input.limit);
      return {
        schemaVersion: 1 as const,
        capacity,
        count: entries.length,
        dropped,
        entries: windowed,
      };
    },
  };
}

describe("DriftHistory* schemas (ADR-132)", () => {
  it("DriftHistoryEntrySchema round-trips a roll-up entry", () => {
    const parsed = DriftHistoryEntrySchema.parse(
      entry({
        seq: 3,
        maxTvd: 0.42,
        alertCount: 2,
        dimensions: [
          { dimension: "decision.kind", tvd: 0.42, alertCount: 1 },
          { dimension: "intent.kind", tvd: 0.1, alertCount: 1 },
        ],
      }),
    );
    expect(parsed.seq).toBe(3);
    expect(parsed.maxTvd).toBeCloseTo(0.42);
    expect(parsed.dimensions).toHaveLength(2);
  });

  it("DriftHistoryEntrySchema rejects a non-ISO `at`", () => {
    expect(
      DriftHistoryEntrySchema.safeParse(entry({ at: "not-a-date" })).success,
    ).toBe(false);
  });

  it("DriftHistoryEntrySchema rejects an unknown dimension (closed enum)", () => {
    const bad = entry({
      dimensions: [{ dimension: "made.up" as never, tvd: 0, alertCount: 0 }],
    });
    expect(DriftHistoryEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("DriftHistoryResultSchema round-trips a full result", () => {
    const result = DriftHistoryResultSchema.parse({
      schemaVersion: 1,
      capacity: 100,
      count: 2,
      dropped: 0,
      entries: [entry({ seq: 0 }), entry({ seq: 1 })],
    });
    expect(result.entries.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("DriftHistoryQuerySchema defaults limit to 100 and caps it at 500", () => {
    expect(DriftHistoryQuerySchema.parse({}).limit).toBe(100);
    expect(DriftHistoryQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
    expect(DriftHistoryQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("governance.driftHistory (ADR-132)", () => {
  it("returns the windowed timeline, no actor required", async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ seq: i, totalObserved: i + 1, maxTvd: i / 10 }),
    );
    const caller = callerWith({
      driftHistory: historyPort(entries, { capacity: 8, dropped: 0 }),
    });
    const out = await caller.governance.driftHistory({ limit: 100 });
    expect(out.schemaVersion).toBe(1);
    expect(out.capacity).toBe(8);
    expect(out.count).toBe(5);
    expect(out.dropped).toBe(0);
    expect(out.entries.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it("honours the `limit` by windowing to the last N entries", async () => {
    const entries = Array.from({ length: 5 }, (_, i) => entry({ seq: i }));
    const caller = callerWith({ driftHistory: historyPort(entries) });
    const out = await caller.governance.driftHistory({ limit: 2 });
    expect(out.entries.map((e) => e.seq)).toEqual([3, 4]);
    // `count` still reflects total retained, independent of the window.
    expect(out.count).toBe(5);
  });

  it("defaults `limit` to 100 when omitted", async () => {
    const entries = [entry({ seq: 0 }), entry({ seq: 1 })];
    const caller = callerWith({ driftHistory: historyPort(entries) });
    const out = await caller.governance.driftHistory({});
    expect(out.entries).toHaveLength(2);
  });

  it("surfaces `dropped` so a dashboard can flag truncated history", async () => {
    const caller = callerWith({
      driftHistory: historyPort([entry({ seq: 7 })], { capacity: 3, dropped: 5 }),
    });
    const out = await caller.governance.driftHistory({ limit: 100 });
    expect(out.dropped).toBe(5);
  });

  it("PRECONDITION_FAILED when no history is wired", async () => {
    const caller = callerWith({});
    await expect(caller.governance.driftHistory({ limit: 100 })).rejects.toThrow(
      /not configured/i,
    );
  });

  it("does not regress the single-point governance.behavioralDrift", async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      baselineWindow: 4,
      recentWindow: 4,
      alertThreshold: 0.25,
      totalObserved: 8,
      dimensions: [],
    };
    const caller = callerWith({ driftDetector: { snapshot: () => snapshot } });
    const out = await caller.governance.behavioralDrift();
    expect(out.totalObserved).toBe(8);
    // behavioralDrift is independent of driftHistory.
    await expect(caller.governance.driftHistory({ limit: 100 })).rejects.toThrow(
      /not configured/i,
    );
  });
});
