import { describe, expect, it } from "vitest";
import {
  generatePromptInjectionEnvelopes,
  generateProvenanceInjectionEnvelopes,
  generateTaintEscalationEnvelopes,
  generateToolScopeViolationEnvelopes,
  runRedTeam,
} from "../src/index.js";
import { strictStubPack } from "./helpers.js";

const pack = strictStubPack();

describe("generatePromptInjectionEnvelopes", () => {
  it("emits perIntent scenarios per kind, all UNTRUSTED/LLM", () => {
    const out = generatePromptInjectionEnvelopes(pack, { perIntent: 3 });
    expect(out.length).toBe(3 * pack.intents.length);
    for (const s of out) {
      expect(s.vector).toBe("prompt_injection");
      expect(s.intent.taint).toBe("UNTRUSTED");
      expect(s.intent.actor.principal).toBe("llm");
      expect(s.defense.acceptable).not.toContain("EXECUTE");
    }
  });
});

describe("generateTaintEscalationEnvelopes", () => {
  it("targets only elevated-minimum kinds, expecting REFUSE", () => {
    const out = generateTaintEscalationEnvelopes(pack, { perIntent: 2 });
    // Only demo.system.callback has an elevated (TRUSTED) minimum. 031 adds one
    // v3-with-resource-refs variant per eligible kind, so the count is
    // perIntent + 1 (2 standard probes + 1 with-refs probe).
    expect(out.length).toBe(2 + 1);
    for (const s of out) {
      expect(s.intent.kind).toBe("demo.system.callback");
      expect(s.intent.taint).toBe("UNTRUSTED");
      expect(s.defense.acceptable).toEqual(["REFUSE"]);
    }
  });

  // 031 — the with-resource-refs probe carries an authorization slot but a
  // declared owner must NOT weaken the taint short-circuit (state→taint→auth).
  it("emits a v3-with-resource-refs variant per eligible kind, still expecting REFUSE", () => {
    const out = generateTaintEscalationEnvelopes(pack, { perIntent: 2 });
    const withRefs = out.filter((s) => s.intent.resourceRefs !== undefined);
    expect(withRefs.length).toBe(1);
    expect(withRefs[0]!.name).toContain("with_resource_refs");
    expect(withRefs[0]!.intent.resourceRefs).toEqual({
      owner: "attacker",
      account: "victim-acct",
    });
    expect(withRefs[0]!.intent.taint).toBe("UNTRUSTED");
    expect(withRefs[0]!.defense.acceptable).toEqual(["REFUSE"]);
  });
});

describe("generateToolScopeViolationEnvelopes", () => {
  it("emits scenarios for intents the planner does not allow", () => {
    const out = generateToolScopeViolationEnvelopes(pack, { perIntent: 1 });
    expect(out.length).toBe(1);
    expect(out[0]!.intent.kind).toBe("demo.system.callback");
    expect(out[0]!.defense.acceptable).not.toContain("EXECUTE");
  });

  it("returns [] when the pack has no planner", () => {
    const noPlanner = { ...pack, planner: undefined };
    expect(generateToolScopeViolationEnvelopes(noPlanner)).toEqual([]);
  });
});

describe("generateProvenanceInjectionEnvelopes (042)", () => {
  it("targets only elevated-minimum kinds, UNTRUSTED + contaminating origin, expecting REFUSE", () => {
    const out = generateProvenanceInjectionEnvelopes(pack, { perIntent: 3 });
    // Only demo.system.callback has an elevated (TRUSTED) minimum → 3 cases.
    expect(out.length).toBe(3);
    for (const s of out) {
      expect(s.vector).toBe("provenance_injection");
      expect(s.intent.kind).toBe("demo.system.callback");
      expect(s.intent.taint).toBe("UNTRUSTED");
      // The laundering signature: a contaminating origin.
      expect(["Retrieved", "ExternalAPI"]).toContain(s.intent.origin);
      expect(s.defense.acceptable).toEqual(["REFUSE"]);
    }
  });

  it("skips UNTRUSTED-min kinds (no sub-minimum proposal to probe)", () => {
    const out = generateProvenanceInjectionEnvelopes(pack, { perIntent: 3 });
    expect(out.some((s) => s.intent.kind === "demo.user.action")).toBe(false);
  });

  it("NON-VACUITY: the kernel REFUSEs the contaminated proposal via propagation_violation", () => {
    // The whole point of 042 — these scenarios must NOT clean-EXECUTE, AND the
    // defense must fire at the taint gate with the propagation attribution (not
    // a bare level_insufficient, and not some unrelated upstream guard).
    const out = generateProvenanceInjectionEnvelopes(pack, { perIntent: 3 });
    const report = runRedTeam(pack, out);
    expect(report.summary.escaped).toBe(0);
    expect(report.summary.errors).toBe(0);
    for (const r of report.results) {
      expect(r.status).toBe("defended");
      expect(r.decision).toBe("REFUSE");
      expect(r.basisCodes).toContain("taint:propagation_violation");
    }
  });

  it("uses planner.visibleReadTools as the laundering source when present", () => {
    const packWithReads = {
      ...pack,
      planner: {
        plan: () => ({
          visibleReadTools: ["knowledge_base_search"],
          allowedIntents: ["demo.user.action"],
        }),
      },
    };
    const out = generateProvenanceInjectionEnvelopes(packWithReads, {
      perIntent: 2,
    });
    expect(out.length).toBe(2);
    for (const s of out) {
      expect((s.intent.payload as { laundered_via: string }).laundered_via).toBe(
        "knowledge_base_search",
      );
    }
  });
});
