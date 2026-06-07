import { describe, expect, it } from "vitest";
import {
  computeRedTeamExitCode,
  generateAllVectors,
  renderRedTeamJson,
  renderRedTeamText,
  runRedTeam,
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
