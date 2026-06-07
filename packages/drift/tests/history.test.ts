import { describe, expect, it } from "vitest";
import { createDriftDetector, createDriftHistory } from "../src/index.js";
import type { DriftSnapshot } from "../src/index.js";
import { many } from "./helpers.js";

/**
 * Coverage for the bounded, deterministic snapshot-history accumulator
 * (ADR-132): capacity/eviction (FIFO + dropped), determinism over the same
 * (snapshot, at) sequence, and the derived maxTvd/alertCount roll-up.
 */

/** A hand-built snapshot so derivation tests carry no detector coupling. */
function snap(over: Partial<DriftSnapshot> = {}): DriftSnapshot {
  return {
    schemaVersion: 1,
    baselineWindow: 4,
    recentWindow: 4,
    alertThreshold: 0.25,
    totalObserved: 8,
    dimensions: [],
    ...over,
  };
}

const AT = "2026-06-07T00:00:00.000Z";

describe("createDriftHistory — recording + view", () => {
  it("records oldest -> newest with a monotonic seq and the supplied `at`", () => {
    const h = createDriftHistory({ capacity: 10 });
    h.record(snap({ totalObserved: 1 }), "2026-06-07T00:00:00.000Z");
    h.record(snap({ totalObserved: 2 }), "2026-06-07T00:01:00.000Z");
    h.record(snap({ totalObserved: 3 }), "2026-06-07T00:02:00.000Z");
    const view = h.view();
    expect(view.count).toBe(3);
    expect(view.dropped).toBe(0);
    expect(view.entries.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(view.entries.map((e) => e.totalObserved)).toEqual([1, 2, 3]);
    expect(view.entries.map((e) => e.at)).toEqual([
      "2026-06-07T00:00:00.000Z",
      "2026-06-07T00:01:00.000Z",
      "2026-06-07T00:02:00.000Z",
    ]);
  });

  it("defaults capacity to 100", () => {
    expect(createDriftHistory().view().capacity).toBe(100);
  });

  it("returns a defensive copy of entries (caller cannot mutate internals)", () => {
    const h = createDriftHistory({ capacity: 5 });
    h.record(snap(), AT);
    const a = h.view().entries;
    (a as unknown as unknown[]).push("tamper");
    expect(h.view().count).toBe(1);
  });
});

describe("createDriftHistory — capacity / eviction", () => {
  it("evicts oldest-first (FIFO) past capacity and counts `dropped`", () => {
    const h = createDriftHistory({ capacity: 3 });
    for (let i = 0; i < 5; i++) h.record(snap({ totalObserved: i }), AT);
    const view = h.view();
    expect(view.capacity).toBe(3);
    expect(view.count).toBe(3);
    expect(view.dropped).toBe(2);
    // The two oldest (totalObserved 0,1; seq 0,1) are gone.
    expect(view.entries.map((e) => e.totalObserved)).toEqual([2, 3, 4]);
    expect(view.entries.map((e) => e.seq)).toEqual([2, 3, 4]);
  });

  it("floors a non-positive/non-finite capacity to the default 100", () => {
    expect(createDriftHistory({ capacity: 0 }).view().capacity).toBe(100);
    expect(createDriftHistory({ capacity: -7 }).view().capacity).toBe(100);
    expect(
      createDriftHistory({ capacity: Number.NaN }).view().capacity,
    ).toBe(100);
  });

  it("floors a fractional capacity", () => {
    const h = createDriftHistory({ capacity: 2.9 });
    expect(h.view().capacity).toBe(2);
    for (let i = 0; i < 4; i++) h.record(snap({ totalObserved: i }), AT);
    expect(h.view().entries.map((e) => e.totalObserved)).toEqual([2, 3]);
  });

  it("reset clears entries + dropped but keeps seq monotonic", () => {
    const h = createDriftHistory({ capacity: 2 });
    for (let i = 0; i < 3; i++) h.record(snap({ totalObserved: i }), AT);
    expect(h.view().dropped).toBe(1);
    h.reset();
    expect(h.view().count).toBe(0);
    expect(h.view().dropped).toBe(0);
    // seq does NOT reuse a pre-reset value.
    h.record(snap({ totalObserved: 99 }), AT);
    expect(h.view().entries[0]!.seq).toBe(3);
  });
});

describe("createDriftHistory — derived maxTvd / alertCount", () => {
  it("derives maxTvd as the max per-dimension TVD and alertCount as the sum", () => {
    const h = createDriftHistory({ capacity: 4 });
    h.record(
      snap({
        dimensions: [
          {
            dimension: "decision.kind",
            baseline: {},
            recent: {},
            tvd: 0.4,
            alerts: [
              {
                dimension: "decision.kind",
                signal: "distribution_shift",
                magnitude: 0.4,
                threshold: 0.25,
                baselineCount: 4,
                recentCount: 4,
              },
            ],
          },
          {
            dimension: "intent.kind",
            baseline: {},
            recent: {},
            tvd: 0.9,
            alerts: [
              {
                dimension: "intent.kind",
                signal: "distribution_shift",
                magnitude: 0.9,
                threshold: 0.25,
                baselineCount: 4,
                recentCount: 4,
              },
              {
                dimension: "intent.kind",
                signal: "new_category",
                magnitude: 1,
                threshold: 0.25,
                category: "b",
                baselineCount: 4,
                recentCount: 4,
              },
            ],
          },
        ],
      }),
      AT,
    );
    const entry = h.view().entries[0]!;
    expect(entry.maxTvd).toBe(0.9);
    expect(entry.alertCount).toBe(3);
    expect(entry.dimensions).toEqual([
      { dimension: "decision.kind", tvd: 0.4, alertCount: 1 },
      { dimension: "intent.kind", tvd: 0.9, alertCount: 2 },
    ]);
  });

  it("yields maxTvd=0 and alertCount=0 for an empty-dimension snapshot", () => {
    const h = createDriftHistory();
    h.record(snap({ dimensions: [] }), AT);
    const entry = h.view().entries[0]!;
    expect(entry.maxTvd).toBe(0);
    expect(entry.alertCount).toBe(0);
    expect(entry.dimensions).toEqual([]);
  });
});

describe("createDriftHistory — determinism", () => {
  it("is byte-identical over the same (snapshot, at) sequence", () => {
    const at = (i: number) =>
      new Date(Date.UTC(2026, 5, 7, 0, i, 0)).toISOString();
    const build = () => {
      const h = createDriftHistory({ capacity: 5 });
      for (let i = 0; i < 12; i++) {
        h.record(snap({ totalObserved: i, dimensions: [] }), at(i));
      }
      return h.view();
    };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("records a real detector snapshot timeline deterministically", () => {
    const replay = (history: ReturnType<typeof createDriftHistory>) => {
      const d = createDriftDetector({
        baselineWindow: 4,
        recentWindow: 4,
        alertThreshold: 0.25,
        dimensions: ["decision.kind", "intent.kind", "basis"],
      });
      const chunks = [many(4, "EXECUTE"), many(4, "REFUSE"), many(4, "DEFER")];
      chunks.forEach((chunk, i) => {
        chunk.forEach((r) => d.observe(r));
        history.record(d.snapshot(), `2026-06-07T0${i}:00:00.000Z`);
      });
    };
    const a = createDriftHistory({ capacity: 8 });
    const b = createDriftHistory({ capacity: 8 });
    replay(a);
    replay(b);
    expect(JSON.stringify(a.view())).toBe(JSON.stringify(b.view()));
    // The REFUSE/DEFER chunks drive maxTvd up off the EXECUTE baseline.
    const last = a.view().entries.at(-1)!;
    expect(last.maxTvd).toBeGreaterThan(0);
  });
});
