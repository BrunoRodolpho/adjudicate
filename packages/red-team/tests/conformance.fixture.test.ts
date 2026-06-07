import { describe, expect, it } from "vitest";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  generateAllVectors,
  runRedTeam,
  type RedTeamPack,
} from "../src/index.js";

/**
 * Lighthouse conformance fixture: the shipped PIX pack must withstand the full
 * red-team suite at the default seed with ZERO escapes. If this fails, either
 * PIX regressed or the harness produces a false escape.
 */
describe("red-team conformance fixture — PIX lighthouse", () => {
  const pix = paymentsPixPack as unknown as RedTeamPack;

  it("PIX defends every vector (0 escapes, 0 errors)", () => {
    const report = runRedTeam(pix, generateAllVectors(pix));
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.escaped).toBe(0);
    expect(report.summary.errors).toBe(0);
  });

  it("is byte-identical across two runs (deterministic report)", () => {
    const a = runRedTeam(pix, generateAllVectors(pix));
    const b = runRedTeam(pix, generateAllVectors(pix));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
