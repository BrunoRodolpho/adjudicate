import { describe, expect, it } from "vitest";
import {
  computeRedTeamExitCode,
  generateAllVectors,
  generateTaintEscalationEnvelopes,
  renderRedTeamJson,
  renderRedTeamText,
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

  it("041: escapesByVector is exhaustive over the extended AttackVector union (incl. provenance_injection)", () => {
    // The exhaustive emptyByVector() Record must carry every key of the closed
    // union — a missing arm fails the type-checker; here we assert at runtime
    // that the new 041 `provenance_injection` key is present and initialized.
    const pack = strictStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    const keys = Object.keys(report.summary.escapesByVector).sort();
    expect(keys).toEqual(
      [
        "prompt_injection",
        "provenance_injection",
        "taint_escalation",
        "tool_scope_violation",
      ].sort(),
    );
    // No generator ships for provenance_injection yet (042/043), so it stays 0.
    expect(report.summary.escapesByVector.provenance_injection).toBe(0);
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
