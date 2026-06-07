import { describe, expect, it } from "vitest";
import {
  createInMemoryRedTeamHistoryStore,
  digestRedTeamReport,
  generateAllVectors,
  runRedTeam,
  runRedTeamAcrossPacks,
  type RedTeamReport,
} from "../src/index.js";
import { leakyStubPack, strictStubPack } from "./helpers.js";

/**
 * Coverage for the red-team run-history surface (ADR-133): the timing-excluded
 * content digest, multi-pack aggregation, and the bounded, deterministic
 * run-history store (append/idempotency/eviction + trend derivation). No
 * wall-clock / RNG on any path — the store takes `at` from the caller.
 */

const AT = "2026-06-07T00:00:00.000Z";

/** A hand-built report so digest/store tests carry no generator coupling. */
function report(over: Partial<RedTeamReport> = {}): RedTeamReport {
  return {
    pack: { id: "stub" },
    results: [
      {
        name: "pi-1",
        vector: "prompt_injection",
        status: "defended",
        acceptable: ["REFUSE"],
      },
      {
        name: "te-1",
        vector: "taint_escalation",
        status: "defended",
        acceptable: ["REFUSE"],
      },
    ],
    summary: {
      total: 2,
      defended: 2,
      escaped: 0,
      errors: 0,
      escapesByVector: {
        prompt_injection: 0,
        taint_escalation: 0,
        tool_scope_violation: 0,
      },
    },
    ...over,
  };
}

describe("digestRedTeamReport — content digest", () => {
  it("is a 0x-prefixed hex digest", () => {
    expect(digestRedTeamReport(report())).toMatch(/^0x[0-9a-f]+$/);
  });

  it("is stable across two equal reports", () => {
    expect(digestRedTeamReport(report())).toBe(digestRedTeamReport(report()));
  });

  it("is invariant to result ORDER (sorted by name+vector)", () => {
    const a = report();
    const b = report({ results: [...report().results].reverse() });
    expect(digestRedTeamReport(a)).toBe(digestRedTeamReport(b));
  });

  it("EXCLUDES timing — two reports differing only by an injected `at` collide", () => {
    const base = report();
    // A timestamp is not part of the report shape; even if a caller tacked one
    // on, the digest projection must not read it.
    const stamped = { ...base, at: "2099-12-31T23:59:59.999Z" } as RedTeamReport;
    expect(digestRedTeamReport(stamped)).toBe(digestRedTeamReport(base));
  });

  it("does not read basisCodes / decision / error (HOW, not WHETHER)", () => {
    const a = report();
    const b = report({
      results: report().results.map((r) => ({
        ...r,
        decision: "REFUSE" as const,
        basisCodes: ["business:RULE_VIOLATED"],
      })),
    });
    expect(digestRedTeamReport(a)).toBe(digestRedTeamReport(b));
  });

  it("FLIPS when a result's status changes (defended → escaped)", () => {
    const before = report();
    const after = report({
      results: [
        { ...report().results[0]!, status: "escaped" },
        report().results[1]!,
      ],
      summary: {
        total: 2,
        defended: 1,
        escaped: 1,
        errors: 0,
        escapesByVector: {
          prompt_injection: 1,
          taint_escalation: 0,
          tool_scope_violation: 0,
        },
      },
    });
    expect(digestRedTeamReport(after)).not.toBe(digestRedTeamReport(before));
  });

  it("flips on a different pack id", () => {
    expect(digestRedTeamReport(report({ pack: { id: "a" } }))).not.toBe(
      digestRedTeamReport(report({ pack: { id: "b" } })),
    );
  });
});

describe("runRedTeamAcrossPacks", () => {
  it("returns one report per pack, in input order", () => {
    const strict = strictStubPack();
    const leaky = leakyStubPack();
    const reports = runRedTeamAcrossPacks([strict, leaky]);
    expect(reports).toHaveLength(2);
    expect(reports[0]!.pack.id).toBe("stub-strict");
    expect(reports[1]!.pack.id).toBe("stub-leaky");
    expect(reports[0]!.summary.escaped).toBe(0);
    expect(reports[1]!.summary.escaped).toBeGreaterThan(0);
  });

  it("is byte-identical to mapping runRedTeam(generateAllVectors()) by hand", () => {
    const packs = [strictStubPack(), leakyStubPack()];
    const viaHelper = runRedTeamAcrossPacks(packs);
    const byHand = packs.map((p) => runRedTeam(p, generateAllVectors(p)));
    expect(JSON.stringify(viaHelper)).toBe(JSON.stringify(byHand));
  });

  it("returns [] for no packs", () => {
    expect(runRedTeamAcrossPacks([])).toEqual([]);
  });
});

describe("createInMemoryRedTeamHistoryStore — record + view", () => {
  it("records a run with the supplied `at`, digest, packId, summary", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report(), AT);
    const view = store.view();
    expect(view.runs).toHaveLength(1);
    const run = view.runs[0]!;
    expect(run.at).toBe(AT);
    expect(run.packId).toBe("stub");
    expect(run.digest).toBe(digestRedTeamReport(report()));
    expect(run.summary.defended).toBe(2);
  });

  it("is IDEMPOTENT on (packId, digest) — re-recording the same content is a no-op", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report(), "2026-06-07T00:00:00.000Z");
    store.record(report(), "2026-06-07T01:00:00.000Z"); // same content, later `at`
    const view = store.view();
    expect(view.runs).toHaveLength(1);
    // The FIRST recording wins (its `at` is retained).
    expect(view.runs[0]!.at).toBe("2026-06-07T00:00:00.000Z");
  });

  it("appends a distinct run when content changes", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report(), "2026-06-07T00:00:00.000Z");
    store.record(
      report({
        results: [{ ...report().results[0]!, status: "escaped" }, report().results[1]!],
        summary: {
          total: 2,
          defended: 1,
          escaped: 1,
          errors: 0,
          escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
        },
      }),
      "2026-06-07T01:00:00.000Z",
    );
    expect(store.view().runs).toHaveLength(2);
  });

  it("returns runs newest-first within a pack", () => {
    const store = createInMemoryRedTeamHistoryStore();
    const r0 = report({ summary: { ...report().summary, defended: 2 }, results: report().results });
    const r1 = report({
      results: [{ ...report().results[0]!, status: "escaped" }, report().results[1]!],
      summary: { total: 2, defended: 1, escaped: 1, errors: 0, escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 } },
    });
    store.record(r0, "2026-06-07T00:00:00.000Z");
    store.record(r1, "2026-06-07T01:00:00.000Z");
    const runs = store.view().runs;
    expect(runs.map((r) => r.at)).toEqual([
      "2026-06-07T01:00:00.000Z",
      "2026-06-07T00:00:00.000Z",
    ]);
  });

  it("partitions runs per pack and preserves first-seen pack order", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report({ pack: { id: "alpha" } }), AT);
    store.record(report({ pack: { id: "beta" } }), AT);
    const view = store.view();
    expect(view.runs.map((r) => r.packId)).toEqual(["alpha", "beta"]);
  });

  it("filters by packId", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report({ pack: { id: "alpha" } }), AT);
    store.record(report({ pack: { id: "beta" } }), AT);
    const view = store.view({ packId: "beta" });
    expect(view.runs).toHaveLength(1);
    expect(view.runs[0]!.packId).toBe("beta");
  });
});

describe("createInMemoryRedTeamHistoryStore — capacity / eviction", () => {
  function distinctReport(i: number): RedTeamReport {
    // Vary defended count so each report has a distinct content digest.
    return report({
      results: report().results.map((r, idx) =>
        idx === 0 ? { ...r, name: `pi-${i}` } : r,
      ),
      summary: { ...report().summary, defended: 2, total: 2, escaped: 0, errors: 0 },
    });
  }

  it("evicts oldest-first (FIFO) past capacity, per pack", () => {
    const store = createInMemoryRedTeamHistoryStore({ capacity: 3 });
    for (let i = 0; i < 5; i++) {
      store.record(distinctReport(i), `2026-06-07T0${i}:00:00.000Z`);
    }
    const runs = store.view().runs;
    expect(runs).toHaveLength(3);
    // Newest-first: 4, 3, 2 retained; 0, 1 evicted.
    expect(runs.map((r) => r.at)).toEqual([
      "2026-06-07T04:00:00.000Z",
      "2026-06-07T03:00:00.000Z",
      "2026-06-07T02:00:00.000Z",
    ]);
  });

  it("defaults capacity to 500 (no eviction at small volume)", () => {
    const store = createInMemoryRedTeamHistoryStore();
    for (let i = 0; i < 10; i++) store.record(distinctReport(i), AT);
    expect(store.view().runs).toHaveLength(10);
  });

  it("floors a non-positive/non-finite capacity to the default 500", () => {
    const s0 = createInMemoryRedTeamHistoryStore({ capacity: 0 });
    for (let i = 0; i < 3; i++) s0.record(distinctReport(i), AT);
    expect(s0.view().runs).toHaveLength(3);
  });

  it("windows runs to the `limit` most-recent per pack", () => {
    const store = createInMemoryRedTeamHistoryStore({ capacity: 100 });
    for (let i = 0; i < 5; i++) {
      store.record(distinctReport(i), `2026-06-07T0${i}:00:00.000Z`);
    }
    const runs = store.view({ limit: 2 }).runs;
    expect(runs.map((r) => r.at)).toEqual([
      "2026-06-07T04:00:00.000Z",
      "2026-06-07T03:00:00.000Z",
    ]);
  });

  it("reset clears all entries", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(report(), AT);
    store.reset();
    expect(store.view().runs).toHaveLength(0);
    expect(store.view().trend).toHaveLength(0);
  });
});

describe("createInMemoryRedTeamHistoryStore — trend derivation", () => {
  function withCounts(defended: number, escaped: number, name: string): RedTeamReport {
    return report({
      results: [{ ...report().results[0]!, name }],
      summary: {
        total: defended + escaped,
        defended,
        escaped,
        errors: 0,
        escapesByVector: { prompt_injection: escaped, taint_escalation: 0, tool_scope_violation: 0 },
      },
    });
  }

  it("derives one chronological (oldest → newest) point per retained run", () => {
    const store = createInMemoryRedTeamHistoryStore();
    store.record(withCounts(5, 0, "a"), "2026-06-07T00:00:00.000Z");
    store.record(withCounts(4, 1, "b"), "2026-06-07T01:00:00.000Z");
    store.record(withCounts(5, 0, "c"), "2026-06-07T02:00:00.000Z");
    const trend = store.view().trend;
    expect(trend.map((p) => p.at)).toEqual([
      "2026-06-07T00:00:00.000Z",
      "2026-06-07T01:00:00.000Z",
      "2026-06-07T02:00:00.000Z",
    ]);
    expect(trend.map((p) => p.defended)).toEqual([5, 4, 5]);
    expect(trend.map((p) => p.escaped)).toEqual([0, 1, 0]);
    expect(trend.every((p) => p.errors === 0)).toBe(true);
    expect(trend.map((p) => p.total)).toEqual([5, 5, 5]);
  });

  it("is deterministic over the same (report, at) sequence", () => {
    const build = () => {
      const store = createInMemoryRedTeamHistoryStore({ capacity: 4 });
      for (let i = 0; i < 6; i++) {
        store.record(withCounts(5 - (i % 2), i % 2, `s-${i}`), `2026-06-07T0${i}:00:00.000Z`);
      }
      return store.view();
    };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("ties the digest to the produced report — record then verify", () => {
    const store = createInMemoryRedTeamHistoryStore();
    const pix = runRedTeam(strictStubPack(), generateAllVectors(strictStubPack()));
    store.record(pix, AT);
    const run = store.view().runs[0]!;
    expect(run.digest).toBe(digestRedTeamReport(pix));
  });
});
