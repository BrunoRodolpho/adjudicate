import { describe, expect, it } from "vitest";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";
import type { PackV0 } from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  analyzePolicy,
  policyCoherenceAnalyzer,
  compositionReachabilityAnalyzer,
  compositionEscalationCycleAnalyzer,
  detectEscalationCycles,
  type PlannerProbe,
} from "../src/index.js";

function thresholdGuard(name: string, threshold: number, comparator: ">=" | "<=" | ">" | "<") {
  return withMetadata((() => null) as Guard<string, unknown, unknown>, {
    name,
    description: { kind: "threshold", threshold, comparator },
  });
}

type AnyPack = PackV0<string, unknown, unknown, unknown>;

function pack(over: {
  intents?: string[];
  allowedIntents?: string[];
  taint?: (k: string) => "SYSTEM" | "TRUSTED" | "UNTRUSTED";
  business?: Guard<string, unknown, unknown>[];
  plannerThrows?: boolean;
}): AnyPack {
  return {
    id: "t/coherence",
    version: "0.0.0",
    contract: "v0",
    intents: over.intents ?? ["x.create"],
    basisCodes: ["x.code"],
    signals: [],
    policy: {
      stateGuards: [],
      authGuards: [],
      business: over.business ?? [],
      taint: { minimumFor: over.taint ?? (() => "UNTRUSTED") },
      default: "REFUSE",
    },
    planner: {
      plan: () => {
        if (over.plannerThrows) throw new Error("boom");
        return { visibleReadTools: [], allowedIntents: over.allowedIntents ?? ["x.create"] };
      },
    },
  } as unknown as AnyPack;
}

const probe: PlannerProbe = { label: "default", state: {}, context: {} };

function rules(diags: ReturnType<typeof policyCoherenceAnalyzer.analyze>): string[] {
  return diags.map((d) => d.detail?.rule as string);
}

describe("PolicyCoherenceAnalyzer (AJD-301)", () => {
  it("clean PIX pack produces zero AJD-301 errors", () => {
    const probes: PlannerProbe[] = [
      { label: "empty", state: { charges: new Map() }, context: {} },
      {
        label: "confirmed",
        state: { charges: new Map([["c", { id: "c", amountCentavos: 1, status: "confirmed", createdAt: "x" }]]) },
        context: {},
      },
    ];
    const report = analyzePolicy({ pack: paymentsPixPack as AnyPack, plannerProbes: probes });
    expect(report.diagnostics.filter((d) => d.code === "AJD-301" && d.severity === "error")).toHaveLength(0);
  });

  it("flags a phantom allowed-intent (error)", () => {
    const d = policyCoherenceAnalyzer.analyze(pack({ intents: ["x.create"], allowedIntents: ["x.ghost"] }), [probe]);
    expect(rules(d)).toContain("phantom_intent");
    expect(d.find((x) => x.detail?.rule === "phantom_intent")?.severity).toBe("error");
  });

  it("flags an unreachable declared intent (warning), excluding system-only kinds", () => {
    const d = policyCoherenceAnalyzer.analyze(
      pack({ intents: ["x.create", "x.never", "x.sys"], allowedIntents: ["x.create"], taint: (k) => (k === "x.sys" ? "TRUSTED" : "UNTRUSTED") }),
      [probe],
    );
    const unreachable = d.filter((x) => x.detail?.rule === "unreachable_intent").map((x) => x.detail?.intent);
    expect(unreachable).toContain("x.never");
    expect(unreachable).not.toContain("x.sys"); // system-only excluded
  });

  it("flags a system-taint contradiction (warning)", () => {
    const d = policyCoherenceAnalyzer.analyze(
      pack({ intents: ["x.admin"], allowedIntents: ["x.admin"], taint: () => "TRUSTED" }),
      [probe],
    );
    expect(rules(d)).toContain("system_taint_contradiction");
  });

  it("flags a threshold conflict (note) without resolving the field", () => {
    const lo = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "lo",
      description: { kind: "threshold", threshold: 100, comparator: ">=" },
    });
    const hi = withMetadata((() => null) as Guard<string, unknown, unknown>, {
      name: "hi",
      description: { kind: "threshold", threshold: 50, comparator: "<=" },
    });
    const d = policyCoherenceAnalyzer.analyze(pack({ business: [lo, hi] }), [probe]);
    const conflict = d.find((x) => x.detail?.rule === "threshold_conflict");
    expect(conflict?.severity).toBe("note");
    expect(conflict?.detail?.unverifiableField).toBe(true);
  });

  it("a throwing planner yields a planner_probe_error note, not a crash", () => {
    const d = policyCoherenceAnalyzer.analyze(pack({ plannerThrows: true }), [probe]);
    expect(rules(d)).toContain("planner_probe_error");
  });

  it("is deterministic and probe-order-insensitive", () => {
    const p = pack({ intents: ["x.create", "x.never"], allowedIntents: ["x.create"] });
    const probesA: PlannerProbe[] = [{ label: "a", state: {}, context: {} }, { label: "b", state: {}, context: {} }];
    const probesB = [...probesA].reverse();
    expect(JSON.stringify(policyCoherenceAnalyzer.analyze(p, probesA))).toBe(
      JSON.stringify(policyCoherenceAnalyzer.analyze(p, probesB)),
    );
  });

  it("pipeline: analyzePolicy includes AJD-301 only when plannerProbes supplied", () => {
    const p = pack({ intents: ["x.create"], allowedIntents: ["x.ghost"] });
    const without = analyzePolicy({ pack: p });
    const withProbes = analyzePolicy({ pack: p, plannerProbes: [probe] });
    expect(without.diagnostics.some((d) => d.code === "AJD-301")).toBe(false);
    expect(withProbes.diagnostics.some((d) => d.code === "AJD-301")).toBe(true);
  });
});

describe("CompositionReachabilityAnalyzer (AJD-302)", () => {
  it("emits a probe_coverage_floor warning when probes miss declared intents (counts only)", () => {
    const d = compositionReachabilityAnalyzer.analyze(
      pack({ intents: ["x.a", "x.b", "x.c"], allowedIntents: ["x.a"] }),
      [probe],
    );
    const floor = d.find((x) => x.detail?.rule === "probe_coverage_floor");
    expect(floor?.severity).toBe("warning");
    expect(floor?.detail).toMatchObject({ declaredNonSystem: 3, covered: 1, probeCount: 1 });
    // Confidence caveat: it must NOT re-list the uncovered intents — that is
    // AJD-301 unreachable_intent's job (no double-reporting).
    expect(JSON.stringify(floor?.detail)).not.toContain("x.b");
  });

  it("does not fire the coverage floor at full coverage; excludes system-only intents", () => {
    const full = compositionReachabilityAnalyzer.analyze(
      pack({ intents: ["x.a", "x.b"], allowedIntents: ["x.a", "x.b"] }),
      [probe],
    );
    expect(full.some((x) => x.detail?.rule === "probe_coverage_floor")).toBe(false);
    // x.sys is system-only (elevated taint) → excluded from the coverage denominator.
    const withSys = compositionReachabilityAnalyzer.analyze(
      pack({
        intents: ["x.a", "x.sys"],
        allowedIntents: ["x.a"],
        taint: (k) => (k === "x.sys" ? "TRUSTED" : "UNTRUSTED"),
      }),
      [probe],
    );
    expect(withSys.some((x) => x.detail?.rule === "probe_coverage_floor")).toBe(false);
  });

  it("flags threshold_unreachable when the planner offers no intents", () => {
    const d = compositionReachabilityAnalyzer.analyze(
      pack({ business: [thresholdGuard("t", 10, ">=")], allowedIntents: [] }),
      [probe],
    );
    expect(rules(d)).toContain("threshold_unreachable");
  });

  it("flags threshold_redundancy for same-phase same-direction subsumed bounds (advisory note)", () => {
    const d = compositionReachabilityAnalyzer.analyze(
      pack({
        business: [thresholdGuard("strict", 10, ">="), thresholdGuard("weak", 5, ">=")],
        allowedIntents: ["x.create"],
      }),
      [probe],
    );
    const red = d.find((x) => x.detail?.rule === "threshold_redundancy");
    expect(red?.severity).toBe("note");
    expect(red?.detail).toMatchObject({
      redundant: "business[1]",
      dominating: "business[0]",
      unverifiableField: true,
    });
  });

  it("does not flag redundancy across opposite directions (that is AJD-301 threshold_conflict's domain)", () => {
    const d = compositionReachabilityAnalyzer.analyze(
      pack({
        business: [thresholdGuard("lo", 10, ">="), thresholdGuard("hi", 50, "<=")],
        allowedIntents: ["x.create"],
      }),
      [probe],
    );
    expect(rules(d)).not.toContain("threshold_redundancy");
  });

  it("is deterministic and probe-order-insensitive", () => {
    const p = pack({
      intents: ["x.a", "x.b"],
      allowedIntents: ["x.a"],
      business: [thresholdGuard("a", 10, ">="), thresholdGuard("b", 5, ">=")],
    });
    const A: PlannerProbe[] = [
      { label: "a", state: {}, context: {} },
      { label: "b", state: {}, context: {} },
    ];
    expect(JSON.stringify(compositionReachabilityAnalyzer.analyze(p, A))).toBe(
      JSON.stringify(compositionReachabilityAnalyzer.analyze(p, [...A].reverse())),
    );
  });
});

describe("CompositionEscalationCycle (AJD-303)", () => {
  it("detectEscalationCycles finds back-edge cycles and ignores a DAG", () => {
    expect(
      detectEscalationCycles([
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ]),
    ).toEqual([["a", "b", "a"]]);
    expect(
      detectEscalationCycles([
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ]),
    ).toEqual([]);
    expect(detectEscalationCycles([{ from: "a", to: "a" }])).toEqual([["a", "a"]]);
  });

  it("is a sound no-op on packs today (no escalation-target metadata → no edges)", () => {
    const d = compositionEscalationCycleAnalyzer.analyze(
      pack({ business: [thresholdGuard("t", 10, ">=")], allowedIntents: ["x.create"] }),
      [probe],
    );
    expect(d).toHaveLength(0);
  });
});

describe("Tier-3 pipeline wiring", () => {
  it("runs AJD-302 (advisory) alongside AJD-301 when probes are supplied; never gating", () => {
    const p = pack({ intents: ["x.a", "x.b"], allowedIntents: ["x.a"] });
    const report = analyzePolicy({ pack: p, plannerProbes: [probe] });
    expect(report.diagnostics.some((d) => d.code === "AJD-302")).toBe(true);
    expect(report.diagnostics.filter((d) => d.code === "AJD-302" && d.severity === "error")).toHaveLength(0);
  });
});
