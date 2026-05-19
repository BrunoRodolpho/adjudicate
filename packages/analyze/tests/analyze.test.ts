/**
 * Tier 1 analyzer tests against real and fixture Packs.
 *
 * The PIX Pack is exercised because it's the lighthouse — if the
 * analyzer flags spurious diagnostics on PIX, the implementation has
 * a precision-recall bug.
 */

import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  decisionRefuse,
  refuse,
  type PackV0,
} from "@adjudicate/core";
import { nameGuard, withMetadata, type Guard } from "@adjudicate/core/kernel";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  analyzePolicy,
  missingMetadataAnalyzer,
  signalConsistencyAnalyzer,
  basisCodeConsistencyAnalyzer,
  rewriteScopeAnalyzer,
  taintPolicyAnalyzer,
  defaultPolarityAnalyzer,
  renderText,
  renderJson,
  renderSarif,
} from "../src/index.js";

const fixedNow = () => new Date("2026-05-18T12:00:00.000Z");

describe("analyzePolicy() against PIX Pack", () => {
  it("PIX pack produces zero errors (lighthouse precision check)", () => {
    const report = analyzePolicy({ pack: paymentsPixPack, now: fixedNow });
    expect(report.summary.error).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("strict mode escalates warnings to errors", () => {
    const report = analyzePolicy({
      pack: paymentsPixPack,
      strict: true,
      now: fixedNow,
    });
    // PIX may have warnings; strict promotes them to errors.
    if (report.summary.warning > 0 || report.summary.error > 0) {
      // strict mode: warnings count as errors in `passed`
      expect(report.diagnostics.every((d) => d.severity !== "warning")).toBe(true);
    }
  });
});

describe("MissingMetadataAnalyzer (AJD-101)", () => {
  it("flags guards without name and without description", () => {
    const anonymousGuard: Guard<string, unknown, unknown> = (() => null) as Guard<
      string,
      unknown,
      unknown
    >;
    Object.defineProperty(anonymousGuard, "name", { value: "" });
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/anonymous",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [anonymousGuard],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = missingMetadataAnalyzer.analyze(pack);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]?.code).toBe("AJD-101");
  });

  it("does NOT flag named const guards (Function.name suffices)", () => {
    const namedGuard: Guard<string, unknown, unknown> = function namedGuard() {
      return null;
    };
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/named",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [namedGuard],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = missingMetadataAnalyzer.analyze(pack);
    expect(diags.length).toBe(0);
  });
});

describe("SignalConsistencyAnalyzer (AJD-102)", () => {
  it("flags guards with state_defer signals not in Pack.signals", () => {
    const deferGuard: Guard<string, unknown, unknown> = withMetadata(
      function myDeferGuard(): null {
        return null;
      } as Guard<string, unknown, unknown>,
      {
        name: "myDeferGuard",
        description: { kind: "state_defer", signal: "ghost.signal", timeoutMs: 1000 },
      },
    );
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/signal-mismatch",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [], // empty, but guard defers on "ghost.signal"
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [deferGuard],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = signalConsistencyAnalyzer.analyze(pack);
    expect(diags.some((d) => d.code === "AJD-102" && d.severity === "error")).toBe(true);
  });
});

describe("TaintPolicyAnalyzer (AJD-105)", () => {
  it("flags taint policy throwing for declared intent", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/throwing-taint",
      version: "0.0.0",
      intents: ["bad.kind"],
      basisCodes: ["bad.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: {
          minimumFor: (k) => {
            if (k === "bad.kind") throw new Error("taint policy borked");
            return "UNTRUSTED";
          },
        },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = taintPolicyAnalyzer.analyze(pack);
    expect(diags.some((d) => d.code === "AJD-105" && d.severity === "error")).toBe(true);
  });

  it("flags taint policy returning non-Taint values", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/wrong-taint",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: {
          minimumFor: () => "NOT_A_TAINT" as unknown as "UNTRUSTED",
        },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = taintPolicyAnalyzer.analyze(pack);
    expect(diags.some((d) => d.code === "AJD-105")).toBe(true);
  });
});

describe("DefaultPolarityAnalyzer (AJD-106)", () => {
  it("flags policy.default = EXECUTE as a warning", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/fail-open",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "EXECUTE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = defaultPolarityAnalyzer.analyze(pack);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe("AJD-106");
    expect(diags[0]?.severity).toBe("warning");
  });

  it("does NOT flag policy.default = REFUSE", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/fail-closed",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "REFUSE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const diags = defaultPolarityAnalyzer.analyze(pack);
    expect(diags.length).toBe(0);
  });
});

describe("Renderers", () => {
  it("renderText produces non-empty output", () => {
    const report = analyzePolicy({ pack: paymentsPixPack, now: fixedNow });
    const text = renderText(report);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(paymentsPixPack.id);
  });

  it("renderJson produces parseable JSON", () => {
    const report = analyzePolicy({ pack: paymentsPixPack, now: fixedNow });
    const json = renderJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.packId).toBe(paymentsPixPack.id);
  });

  it("renderSarif produces SARIF 2.1.0 structure", () => {
    const report = analyzePolicy({ pack: paymentsPixPack, now: fixedNow });
    const sarif = JSON.parse(renderSarif(report));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.name).toBe("@adjudicate/analyze");
  });
});

describe("severityOverrides + strict mode", () => {
  it("overrides downgrade a diagnostic", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/override",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "EXECUTE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const report = analyzePolicy({
      pack,
      severityOverrides: { "AJD-106": "note" },
      now: fixedNow,
    });
    const aj106 = report.diagnostics.find((d) => d.code === "AJD-106");
    expect(aj106?.severity).toBe("note");
  });

  it("strict promotes warnings to errors", () => {
    const pack: PackV0<string, unknown, unknown, unknown> = {
      contract: "v0",
      id: "test/strict",
      version: "0.0.0",
      intents: ["x"],
      basisCodes: ["x.code"],
      signals: [],
      policy: {
        stateGuards: [],
        authGuards: [],
        business: [],
        taint: { minimumFor: () => "UNTRUSTED" },
        default: "EXECUTE",
      },
      planner: { plan: () => ({ visibleReadTools: [], allowedIntents: [], forbiddenConcepts: [] }) },
    };
    const report = analyzePolicy({ pack, strict: true, now: fixedNow });
    expect(report.summary.error).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });
});
