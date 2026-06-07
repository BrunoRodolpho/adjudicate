import { describe, expect, it } from "vitest";
import {
  projectRedTeamDefense,
  projectRedTeamDefenses,
} from "./red-team-transparency";
import {
  RED_TEAM_TRANSPARENCY_SAMPLE,
  type RedTeamDefenseSample,
} from "./transparency-fixtures";

/**
 * The public red-team projection is AGGREGATE-ONLY + BANDED (ADR-133). These
 * tests pin the load-bearing safety property: no scenario name, payload, basis
 * code, decision, error, vector breakdown, or raw escape count can cross the
 * public boundary — only `{ packId, displayName, total, defended,
 * lastRunStatus }`.
 */

const ALLOWED_KEYS = new Set([
  "packId",
  "displayName",
  "total",
  "defended",
  "lastRunStatus",
]);

describe("projectRedTeamDefense — banded aggregate", () => {
  it("marks all-defended as clean", () => {
    const out = projectRedTeamDefense({
      packId: "p",
      displayName: "P",
      total: 36,
      defended: 36,
    });
    expect(out.lastRunStatus).toBe("clean");
    expect(out.total).toBe(36);
    expect(out.defended).toBe(36);
  });

  it("marks a shortfall as regressed without exposing the escape count", () => {
    const out = projectRedTeamDefense({
      packId: "p",
      displayName: "P",
      total: 33,
      defended: 32,
    });
    expect(out.lastRunStatus).toBe("regressed");
    // The escape count (1) is NOT a field of the output.
    expect(Object.prototype.hasOwnProperty.call(out, "escaped")).toBe(false);
  });

  it("clamps a tampered defended > total to total (reads clean, leaks nothing)", () => {
    const out = projectRedTeamDefense({
      packId: "p",
      displayName: "P",
      total: 10,
      defended: 999,
    });
    expect(out.defended).toBe(10);
    expect(out.lastRunStatus).toBe("clean");
  });

  it("is deterministic over the input", () => {
    const a = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
    const b = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
    expect(a).toEqual(b);
  });

  it("projects the shipped fixture in order, with one regressed pack", () => {
    const out = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
    expect(out.map((d) => d.packId)).toEqual([
      "pack-payments-pix",
      "pack-identity-kyc",
      "pack-deployments-approval",
      "pack-incident-response",
      "pack-access-governance",
    ]);
    const regressed = out.filter((d) => d.lastRunStatus === "regressed");
    expect(regressed.map((d) => d.packId)).toEqual(["pack-deployments-approval"]);
  });
});

describe("projectRedTeamDefense — no sensitive leak", () => {
  it("emits only allowlisted aggregate keys", () => {
    for (const out of projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE)) {
      for (const key of Object.keys(out)) {
        expect(ALLOWED_KEYS.has(key)).toBe(true);
      }
    }
  });

  it("drops any injected scenario name / basis code / payload / vector map", () => {
    const tampered = {
      packId: "pack-payments-pix",
      displayName: "Payments · PIX",
      total: 36,
      defended: 35,
      // Hostile extras a careless producer might attach:
      results: [
        { name: "pix.injection.amount_override", basisCodes: ["taint:level_insufficient"], decision: "EXECUTE" },
      ],
      escapesByVector: { prompt_injection: 1, taint_escalation: 0, tool_scope_violation: 0 },
      escaped: 1,
      errors: 0,
      acceptable: ["REFUSE"],
      error: "stack trace leak",
    } as unknown as RedTeamDefenseSample;

    const out = projectRedTeamDefense(tampered);
    const json = JSON.stringify(out);

    for (const forbidden of [
      "pix.injection.amount_override",
      "taint:level_insufficient",
      "EXECUTE",
      "prompt_injection",
      "stack trace leak",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const forbiddenKey of [
      "results",
      "escapesByVector",
      "escaped",
      "errors",
      "acceptable",
      "error",
      "basisCodes",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(out, forbiddenKey)).toBe(false);
    }
    // Still a faithful clean/regressed band over just the two counts.
    expect(out.lastRunStatus).toBe("regressed");
  });
});
