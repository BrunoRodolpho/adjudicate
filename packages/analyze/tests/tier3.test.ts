import { describe, expect, it } from "vitest";
import { withMetadata, type Guard } from "@adjudicate/core/kernel";
import type { PackV0 } from "@adjudicate/core";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  analyzePolicy,
  policyCoherenceAnalyzer,
  type PlannerProbe,
} from "../src/index.js";

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
