import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PackV0, Taint } from "@adjudicate/core";
import { withMetadata } from "@adjudicate/core/kernel";
import { analyzeComposition } from "../src/composition.js";

// Fresh guard fn per call — withMetadata keys metadata by function identity.
const freshGuard = () => () => null;

function pack(opts: {
  id: string;
  intents: string[];
  taintFor?: (k: string) => Taint;
  mutates?: string[];
  deferSignal?: string;
}): PackV0 {
  const business: unknown[] = [];
  if (opts.mutates) {
    business.push(withMetadata(freshGuard(), { description: { kind: "rewrite", mutatesPayloadFields: opts.mutates } }));
  }
  const stateGuards: unknown[] = [];
  if (opts.deferSignal) {
    stateGuards.push(
      withMetadata(freshGuard(), { description: { kind: "state_defer", signal: opts.deferSignal, timeoutMs: 1000 } }),
    );
  }
  return {
    id: opts.id,
    version: "1.0.0",
    contract: "v0",
    intents: opts.intents,
    signals: opts.deferSignal ? [opts.deferSignal] : [],
    basisCodes: ["state:transition_valid"],
    policy: {
      stateGuards,
      authGuards: [],
      taint: { minimumFor: opts.taintFor ?? (() => "UNTRUSTED") },
      business,
      default: "REFUSE",
    } as unknown as PackV0["policy"],
    planner: { plan: () => ({ visibleReadTools: [], allowedIntents: opts.intents }) } as unknown as PackV0["planner"],
  } as unknown as PackV0;
}

describe("analyzeComposition (ADR-140, Tier-1)", () => {
  it("flags all four gating conflicts between two colliding packs", () => {
    const a = pack({ id: "pack-a", intents: ["x.do"], taintFor: () => "UNTRUSTED", mutates: ["amount"], deferSignal: "shared.signal" });
    const b = pack({ id: "pack-b", intents: ["x.do"], taintFor: () => "TRUSTED", mutates: ["amount"], deferSignal: "shared.signal" });
    const report = analyzeComposition([a, b]);
    const codes = report.conflicts.map((c) => c.code).sort();
    expect(codes).toEqual(["AJD-107", "AJD-108", "AJD-109", "AJD-110"]);
    expect(report.passed).toBe(false);
    expect(report.summary.error).toBe(4);
    expect(report.packIds).toEqual(["pack-a", "pack-b"]);
  });

  it("passes for well-separated packs (distinct intents/fields/signals)", () => {
    const a = pack({ id: "pack-a", intents: ["a.do"], mutates: ["fieldA"], deferSignal: "pack-a:sig" });
    const b = pack({ id: "pack-b", intents: ["b.do"], mutates: ["fieldB"], deferSignal: "pack-b:sig" });
    const report = analyzeComposition([a, b]);
    expect(report.conflicts).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("detects only the taint contradiction when intents collide but fields/signals don't", () => {
    const a = pack({ id: "pack-a", intents: ["x.do"], taintFor: () => "UNTRUSTED" });
    const b = pack({ id: "pack-b", intents: ["x.do"], taintFor: () => "TRUSTED" });
    const report = analyzeComposition([a, b]);
    expect(report.conflicts.map((c) => c.code).sort()).toEqual(["AJD-109", "AJD-110"]);
  });

  it("severityOverrides can downgrade a gating check (and flip passed)", () => {
    const a = pack({ id: "pack-a", intents: ["x.do"] });
    const b = pack({ id: "pack-b", intents: ["x.do"] });
    const report = analyzeComposition([a, b], { severityOverrides: { "AJD-110": "warning" } });
    expect(report.summary.error).toBe(0);
    expect(report.summary.warning).toBe(1);
    expect(report.passed).toBe(true);
  });

  it("is deterministic (same packs → identical report)", () => {
    const mk = () => [
      pack({ id: "pack-b", intents: ["x.do"], mutates: ["amount"] }),
      pack({ id: "pack-a", intents: ["x.do"], mutates: ["amount"] }),
    ];
    expect(JSON.stringify(analyzeComposition(mk()))).toBe(JSON.stringify(analyzeComposition(mk())));
  });
});

describe("composition_no_runtime_path conformance (ADR-140)", () => {
  it("@adjudicate/core does NOT depend on @adjudicate/analyze (offline-only invariant)", () => {
    const corePkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../core/package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(corePkg.dependencies ?? {}), ...(corePkg.devDependencies ?? {}) };
    expect(Object.keys(deps)).not.toContain("@adjudicate/analyze");
  });
});
