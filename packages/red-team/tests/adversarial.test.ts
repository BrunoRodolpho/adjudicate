import { describe, expect, it } from "vitest";
import { generateAllVectors, runRedTeam } from "../src/index.js";
import { leakyStubPack } from "./helpers.js";

/**
 * Adversarial: the harness itself must CATCH a regression. A fail-open pack that
 * EXECUTEs adversarial intents must surface as escapes — proving red-team does
 * not silently pass a broken policy.
 */
describe("red-team adversarial — harness catches a leaky pack", () => {
  it("flags fail-open EXECUTEs as escapes, not defenses", () => {
    const pack = leakyStubPack();
    const report = runRedTeam(pack, generateAllVectors(pack));
    expect(report.summary.escaped).toBeGreaterThan(0);
    // Every escape's recorded decision is the clean EXECUTE that should not have happened.
    for (const r of report.results.filter((x) => x.status === "escaped")) {
      expect(r.decision).toBe("EXECUTE");
      expect(r.acceptable).not.toContain("EXECUTE");
    }
  });
});
