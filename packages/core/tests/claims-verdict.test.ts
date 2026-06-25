/**
 * Q1 — ClaimVerdict + TurnTerminal (SDD §I, §K; v1.1 §9).
 *
 * Proves: the 3-valued claim verdict is EXACTLY {VALIDATED, UNKNOWN, REFUSED};
 * the 4 turn terminals are EXACTLY {RENDER, UNKNOWN, ESCALATE, CLARIFY} with
 * ESCALATE + CLARIFY FIRST-CLASS; and the two spaces are NOT collapsed (the §P
 * misreading "terminate VALIDATED/UNKNOWN/REFUSED").
 */

import { describe, expect, it } from "vitest";
import {
  CLAIM_VERDICTS,
  TURN_TERMINALS,
  isClaimVerdict,
  isTurnTerminal,
  type ClaimVerdict,
  type TurnTerminal,
} from "@adjudicate/core";

describe("ClaimVerdict — §I/§K three-valued verdict (AC1)", () => {
  it("CLAIM_VERDICTS is EXACTLY the three members, in spec order", () => {
    // Exact membership — no more, no less (SDD §R topology cond. 4: the
    // three-valued model must not be reversed or removed).
    expect(CLAIM_VERDICTS).toEqual(["VALIDATED", "UNKNOWN", "REFUSED"]);
    expect(CLAIM_VERDICTS).toHaveLength(3);
    expect(new Set(CLAIM_VERDICTS).size).toBe(3); // no duplicates
  });

  it("isClaimVerdict ACCEPTS each of the three and only those", () => {
    for (const v of CLAIM_VERDICTS) {
      expect(isClaimVerdict(v)).toBe(true);
    }
  });

  it("isClaimVerdict REJECTS non-members, incl. turn terminals and junk", () => {
    // ESCALATE/CLARIFY/RENDER are turn terminals, NOT claim verdicts — rejecting
    // them here proves the claim space is not the turn space.
    for (const notVerdict of [
      "ESCALATE",
      "CLARIFY",
      "RENDER",
      "validated",
      "VALID",
      "",
      "PENDING",
    ]) {
      expect(isClaimVerdict(notVerdict)).toBe(false);
    }
    for (const notString of [null, undefined, 0, 1, {}, [], true]) {
      expect(isClaimVerdict(notString)).toBe(false);
    }
  });
});

describe("TurnTerminal — §I/§9 four first-class terminals (AC2)", () => {
  it("TURN_TERMINALS is EXACTLY the four members, in spec order", () => {
    expect(TURN_TERMINALS).toEqual(["RENDER", "UNKNOWN", "ESCALATE", "CLARIFY"]);
    expect(TURN_TERMINALS).toHaveLength(4);
    expect(new Set(TURN_TERMINALS).size).toBe(4);
  });

  it("ESCALATE and CLARIFY are FIRST-CLASS turn terminals (§I, §P)", () => {
    // The §P misreading collapses the turn space to the 3-valued verdict; both
    // ESCALATE and CLARIFY must be present and accepted.
    expect(TURN_TERMINALS).toContain("ESCALATE");
    expect(TURN_TERMINALS).toContain("CLARIFY");
    expect(isTurnTerminal("ESCALATE")).toBe(true);
    expect(isTurnTerminal("CLARIFY")).toBe(true);
  });

  it("isTurnTerminal ACCEPTS each of the four and only those", () => {
    for (const t of TURN_TERMINALS) {
      expect(isTurnTerminal(t)).toBe(true);
    }
  });

  it("isTurnTerminal REJECTS non-members incl. the claim-only verdicts", () => {
    // VALIDATED/REFUSED are claim verdicts, never turn terminals.
    for (const notTerminal of ["VALIDATED", "REFUSED", "render", "escalate", ""]) {
      expect(isTurnTerminal(notTerminal)).toBe(false);
    }
    for (const notString of [null, undefined, 0, {}, []]) {
      expect(isTurnTerminal(notString)).toBe(false);
    }
  });
});

describe("TurnTerminal is DISTINCT from ClaimVerdict — NOT collapsed (AC2, §P)", () => {
  it("the turn space is not the claim-verdict space (different membership)", () => {
    // Non-vacuity anchor: the turn space has 4 members and the claim space has
    // 3 — collapsing them would force equality and turn this RED.
    expect(TURN_TERMINALS).not.toEqual(CLAIM_VERDICTS as readonly string[]);
    expect(TURN_TERMINALS.length).not.toBe(CLAIM_VERDICTS.length);
  });

  it("ESCALATE and CLARIFY exist in the turn space but NOT the claim space", () => {
    // If TurnTerminal were collapsed to ClaimVerdict, these would fail: a
    // collapsed space has no ESCALATE/CLARIFY. This is the §P guard.
    const turnSet = new Set<string>(TURN_TERMINALS);
    const verdictSet = new Set<string>(CLAIM_VERDICTS);
    expect(turnSet.has("ESCALATE")).toBe(true);
    expect(turnSet.has("CLARIFY")).toBe(true);
    expect(verdictSet.has("ESCALATE")).toBe(false);
    expect(verdictSet.has("CLARIFY")).toBe(false);
  });

  it("VALIDATED and REFUSED are claim-only — never turn terminals", () => {
    expect(isTurnTerminal("VALIDATED")).toBe(false);
    expect(isTurnTerminal("REFUSED")).toBe(false);
    expect(isClaimVerdict("VALIDATED")).toBe(true);
    expect(isClaimVerdict("REFUSED")).toBe(true);
  });

  it("only UNKNOWN is shared across both spaces (the sole overlap)", () => {
    // UNKNOWN is the one label common to both (§I) — the spaces overlap on
    // exactly one member, which is itself proof they are not identical.
    const shared = (CLAIM_VERDICTS as readonly string[]).filter((v) =>
      (TURN_TERMINALS as readonly string[]).includes(v),
    );
    expect(shared).toEqual(["UNKNOWN"]);
  });
});

describe("type-level wiring (compiles ⟺ unions are the spec unions)", () => {
  it("each tuple member is assignable to its declared type", () => {
    // A compile-time witness: if the union drifted from the tuple, this stops
    // type-checking under `build`.
    const v: ClaimVerdict = CLAIM_VERDICTS[0]!;
    const t: TurnTerminal = TURN_TERMINALS[0]!;
    expect(isClaimVerdict(v)).toBe(true);
    expect(isTurnTerminal(t)).toBe(true);
  });
});
