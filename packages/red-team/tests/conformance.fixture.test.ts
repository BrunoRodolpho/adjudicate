import { describe, expect, it } from "vitest";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import {
  generateAllVectors,
  generateTaintEscalationEnvelopes,
  runRedTeam,
  taintEscalationCausality,
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

  // Causality (MISS-1): `escaped===0` is vacuous on its own. Assert the
  // breakdown is internally consistent AND document the honest finding: PIX's
  // sole system-only kind (`pix.charge.confirm`) is refused by a STATE
  // precondition (`validateConfirmTarget` — the charge does not exist) before
  // the taint gate runs, so the taint gate catches 0 of PIX's taint-escalation
  // scenarios. They are still defended — just upstream of the taint gate.
  it("taint-escalation defenses are accounted for by cause (PIX: caught by preconditions, not the taint gate)", () => {
    const report = runRedTeam(pix, generateTaintEscalationEnvelopes(pix));
    const c = taintEscalationCausality(report);
    expect(c.total).toBeGreaterThan(0);
    expect(c.escaped).toBe(0);
    // Every defended scenario is attributed to exactly one cause.
    expect(c.byTaintGate + c.byOtherGuard).toBe(c.total);
    // The honest finding the audit surfaced: a precondition fires first for PIX.
    expect(c.byOtherGuard).toBe(c.total);
    expect(c.byTaintGate).toBe(0);
  });
});
