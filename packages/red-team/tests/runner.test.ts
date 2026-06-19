import { describe, expect, it } from "vitest";
import { createRewriteGuard } from "@adjudicate/primitives";
import type { Guard, PolicyBundle } from "@adjudicate/core";
import {
  computeRedTeamExitCode,
  generateAllVectors,
  generateTaintEscalationEnvelopes,
  renderRedTeamJson,
  renderRedTeamText,
  runConfigSealCapEditRegression,
  runRedTeam,
  taintEscalationCausality,
  TAINT_GATE_BASIS,
  type RedTeamScenario,
} from "../src/index.js";
import { leakyStubPack, strictStubPack } from "./helpers.js";

describe("runRedTeam", () => {
  it("a fail-closed pack defends every vector (0 escapes, exit 0)", () => {
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    expect(report.summary.escaped).toBe(0);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.defended).toBe(report.summary.total);
    expect(computeRedTeamExitCode(report.summary)).toBe(0);
  });

  it("041/042/043: escapesByVector is exhaustive over the extended AttackVector union (incl. provenance_injection + read_inject_intent)", () => {
    // The exhaustive emptyByVector() Record must carry every key of the closed
    // union — a missing arm fails the type-checker; here we assert at runtime
    // that the `provenance_injection` and 043 `read_inject_intent` keys are
    // present and initialized.
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    const keys = Object.keys(report.summary.escapesByVector).sort();
    expect(keys).toEqual(
      [
        "prompt_injection",
        "provenance_injection",
        "read_inject_intent",
        "taint_escalation",
        "tool_scope_violation",
      ].sort(),
    );
    // 043's read_inject_intent key is present and (for the strict pack, which
    // declares no origin-required kind) initialized to 0.
    expect(report.summary.escapesByVector.read_inject_intent).toBe(0);
    // 042 LANDS the provenance_injection generator. The strict pack DEFENDS those
    // scenarios (the kernel taint gate REFUSEs the contaminated sub-minimum
    // proposal), so the ESCAPE count for the vector is still 0 — defended, not
    // absent. (Non-vacuity that the generator actually fires is asserted below.)
    expect(report.summary.escapesByVector.provenance_injection).toBe(0);
    expect(
      report.results.some((r) => r.vector === "provenance_injection"),
    ).toBe(true);
  });

  it("a fail-open pack leaks → escapes recorded, exit 2", () => {
    const pack = leakyStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    expect(report.summary.escaped).toBeGreaterThan(0);
    expect(report.summary.escapesByVector.prompt_injection).toBeGreaterThan(0);
    expect(computeRedTeamExitCode(report.summary)).toBe(2);
  });

  it("classifies a rehydrate failure as an error (exit 2)", () => {
    const pack = strictStubPack();
    const throwing = {
      ...pack,
      rehydrateState: () => {
        throw new Error("rehydrate boom");
      },
    };
    const scenario: RedTeamScenario = {
      name: "x",
      vector: "prompt_injection",
      intent: {
        kind: "demo.user.action",
        payload: {},
        actor: { principal: "llm", sessionId: "t" },
        taint: "UNTRUSTED",
        nonce: "n-1",
      },
      state: {},
      defense: { acceptable: ["REFUSE"] },
    };
    const report = runRedTeam(throwing, [scenario]);
    expect(report.summary.errors).toBe(1);
    expect(report.results[0]!.status).toBe("error");
    expect(computeRedTeamExitCode(report.summary)).toBe(2);
  });

  it("renders text + json reports", () => {
    const pack = leakyStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    const text = renderRedTeamText(report);
    expect(text).toContain("escaped");
    expect(text).toContain("escapes by vector");
    expect(() => JSON.parse(renderRedTeamJson(report))).not.toThrow();
  });
});

// ── 081: cap-edit config-integrity regression (Critique #27) ──────────────────

/** A business-phase bundle whose only knob is a createRewriteGuard clamp cap. */
function rewriteBundle(cap: number): PolicyBundle<string, unknown, unknown> {
  const clamp = createRewriteGuard<string, Record<string, unknown>, unknown>({
    matches: (env) => env.kind === "remediation.apply",
    extract: (env) => (env.payload as { blast?: number }).blast,
    cap,
    mutateField: "blast",
    reason: "clamp blast radius",
  });
  return {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [clamp as Guard<string, unknown, unknown>],
    default: "REFUSE",
  };
}

describe("runConfigSealCapEditRegression — the cap-edit escape is defended (081)", () => {
  it("DETECTS a closure-cap edit (5 → 5000) as a config-integrity regression", () => {
    const r = runConfigSealCapEditRegression({
      baseline: rewriteBundle(5),
      tampered: rewriteBundle(5000),
    });
    expect(r.detected).toBe(true);
    expect(r.status).toBe("defended");
    expect(r.vector).toBe("config_integrity");
    expect(r.baselineDigest).not.toBe(r.tamperedDigest);
  });

  it("is non-vacuous: an IDENTICAL cap is NOT flagged (digests agree)", () => {
    const r = runConfigSealCapEditRegression({
      baseline: rewriteBundle(5),
      tampered: rewriteBundle(5),
    });
    // No edit → no detection → not an escape: proves detection tracks the CAP,
    // not guard identity/order. A cap-blind seal would (wrongly) also produce
    // detected:false on the 5→5000 case above — that test guards against it.
    expect(r.detected).toBe(false);
    expect(r.baselineDigest).toBe(r.tamperedDigest);
  });
});

describe("taintEscalationCausality — the taint gate is genuinely exercised when reached", () => {
  // strictStubPack's system-only kind (`demo.system.callback`) has NO state
  // precondition, so a sub-minimum UNTRUSTED envelope reaches the taint gate.
  // This proves the gate fires AND that the causality analysis attributes it
  // correctly — the complement of the PIX fixture, where preconditions fire first.
  it("attributes every taint-escalation defense to the taint gate for a precondition-free pack", () => {
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateTaintEscalationEnvelopes(pack));
    const c = taintEscalationCausality(report);
    expect(c.total).toBeGreaterThan(0);
    expect(c.escaped).toBe(0);
    expect(c.byTaintGate).toBe(c.total); // the gate caught all of them
    expect(c.byOtherGuard).toBe(0);
    // And the actual basis really is the taint gate's code.
    const taintResults = report.results.filter((r) => r.vector === "taint_escalation");
    expect(taintResults.every((r) => r.basisCodes?.includes(TAINT_GATE_BASIS))).toBe(true);
  });
});
