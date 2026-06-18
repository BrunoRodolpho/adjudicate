/**
 * Invariant: the monotonic escalation ceiling is a true `min` over the §C
 * restrictiveness lattice (plan 061; index §C / invariant #7).
 *
 * §C codifies `final = min(deterministic_decision, risk_ceiling)`: a ceiling may
 * only RAISE friction, never lower it, and only deterministic rules can authorize
 * EXECUTE. `clampToCeiling` is the pure primitive that realises this `min`.
 *
 * This suite pins, over ALL SIX outcomes (non-vacuous — every `DecisionKind` is
 * sampled, see the `pickKinds` coverage assertion):
 *   1. the RATIFIED total order EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER
 *      < ESCALATE < REFUSE, in particular REWRITE < REQUEST_CONFIRMATION;
 *   2. `clampToCeiling` is at least as restrictive as the deterministic input
 *      (never lowers friction);
 *   3. it never yields EXECUTE unless the DETERMINISTIC input is EXECUTE
 *      (only deterministic rules authorize EXECUTE);
 *   4. it is a genuine `min`: idempotent, commutative-as-min (same outcome KIND
 *      either argument order), absorptive at the extremes, and returns one of its
 *      two inputs UNCHANGED (adds no field, synthesises no 7th outcome).
 *
 * It BUILDS ON, and does not duplicate, the taint property in
 * `untrusted-never-executes.property.test.ts`: that test proves the KERNEL never
 * authorizes EXECUTE for tainted input; this test proves the CEILING primitive
 * that composes over kernel decisions never re-authorizes EXECUTE either.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  clampToCeiling,
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  isAtLeastAsRestrictive,
  refuse,
  restrictivenessRank,
  type Decision,
  type DecisionKind,
} from "@adjudicate/core";

// The ratified total order (index §C), least → most restrictive. This is the
// SPEC; the test asserts the implementation's order equals it exactly.
const RATIFIED_ORDER: readonly DecisionKind[] = [
  "EXECUTE",
  "REWRITE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "ESCALATE",
  "REFUSE",
];

// A concrete, distinct Decision value for each kind, so the property exercises
// the real discriminated-union payloads (not just bare kinds). The `basis`/
// payloads differ per kind so an identity-preservation check is meaningful.
function sample(kind: DecisionKind): Decision {
  switch (kind) {
    case "EXECUTE":
      return decisionExecute([]);
    case "REWRITE":
      return decisionRewrite(
        buildEnvelope<string, unknown>({
          kind: "order.submit",
          payload: { capped: true },
          actor: { principal: "llm", sessionId: "s" },
          taint: "UNTRUSTED",
          nonce: "n-rewrite",
          createdAt: "2026-06-18T00:00:00.000Z",
        }),
        "sanitized",
        [],
      );
    case "REQUEST_CONFIRMATION":
      return decisionRequestConfirmation("are you sure?", []);
    case "DEFER":
      return decisionDefer("payment.webhook", 30_000, []);
    case "ESCALATE":
      return decisionEscalate("human", "needs review", []);
    case "REFUSE":
      return decisionRefuse(refuse("SECURITY", "blocked", "no"), []);
  }
}

const kindArb = fc.constantFrom<DecisionKind>(...RATIFIED_ORDER);
const decisionArb = kindArb.map(sample);

describe("061 invariant: restrictiveness lattice is the ratified total order", () => {
  it("encodes EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER < ESCALATE < REFUSE", () => {
    const byRank = [...RATIFIED_ORDER].sort(
      (a, b) => restrictivenessRank(a) - restrictivenessRank(b),
    );
    expect(byRank).toEqual(RATIFIED_ORDER);
    // Ranks are a contiguous 0..5 permutation (a genuine total order, no gaps/ties).
    expect(RATIFIED_ORDER.map(restrictivenessRank)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("RATIFIED (§C): REWRITE ranks strictly BELOW REQUEST_CONFIRMATION", () => {
    expect(restrictivenessRank("REWRITE")).toBeLessThan(
      restrictivenessRank("REQUEST_CONFIRMATION"),
    );
    expect(isAtLeastAsRestrictive("REQUEST_CONFIRMATION", "REWRITE")).toBe(true);
    expect(isAtLeastAsRestrictive("REWRITE", "REQUEST_CONFIRMATION")).toBe(false);
  });

  it("EXECUTE is the unique minimum, REFUSE the unique maximum", () => {
    for (const k of RATIFIED_ORDER) {
      expect(isAtLeastAsRestrictive(k, "EXECUTE")).toBe(true); // nothing below EXECUTE
      expect(isAtLeastAsRestrictive("REFUSE", k)).toBe(true); // nothing above REFUSE
    }
  });

  it("non-vacuity: the spec order covers ALL SIX closed outcomes exactly once", () => {
    expect(new Set(RATIFIED_ORDER).size).toBe(6);
    // Every kind has a finite rank (none falls off the lattice → indexOf !== -1).
    for (const k of RATIFIED_ORDER) expect(restrictivenessRank(k)).toBeGreaterThanOrEqual(0);
  });
});

describe("061 invariant: clampToCeiling is a friction-only `min` over the lattice", () => {
  it("result is ALWAYS at least as restrictive as the deterministic input (never lowers friction)", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (deterministic, ceiling) => {
        const out = clampToCeiling(deterministic, ceiling);
        expect(isAtLeastAsRestrictive(out.kind, deterministic.kind)).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });

  it("result is the MORE restrictive of the two inputs (a true min over restrictiveness)", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (deterministic, ceiling) => {
        const out = clampToCeiling(deterministic, ceiling);
        const expectedRank = Math.max(
          restrictivenessRank(deterministic.kind),
          restrictivenessRank(ceiling.kind),
        );
        expect(restrictivenessRank(out.kind)).toBe(expectedRank);
      }),
      { numRuns: 1_000 },
    );
  });

  it("never authorizes EXECUTE unless the DETERMINISTIC input was EXECUTE (§C / invariant #1)", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (deterministic, ceiling) => {
        const out = clampToCeiling(deterministic, ceiling);
        if (out.kind === "EXECUTE") {
          expect(deterministic.kind).toBe("EXECUTE");
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("a ceiling can only RAISE friction: any non-EXECUTE ceiling over an EXECUTE deterministic raises", () => {
    fc.assert(
      fc.property(kindArb, (ceilingKind) => {
        const out = clampToCeiling(sample("EXECUTE"), sample(ceilingKind));
        // EXECUTE is the minimum, so the ceiling always wins (== ceilingKind).
        expect(out.kind).toBe(ceilingKind);
      }),
      { numRuns: 1_000 },
    );
  });

  it("a ceiling can NEVER lower a more-restrictive deterministic decision (e.g. EXECUTE-ceiling over REFUSE is a no-op)", () => {
    fc.assert(
      fc.property(decisionArb, (deterministic) => {
        const out = clampToCeiling(deterministic, sample("EXECUTE"));
        // EXECUTE ceiling is the lattice minimum → never wins → deterministic stands.
        expect(out).toBe(deterministic);
        expect(out.kind).toBe(deterministic.kind);
      }),
      { numRuns: 1_000 },
    );
  });

  it("idempotent: clamping by the same Decision is the identity", () => {
    fc.assert(
      fc.property(decisionArb, (d) => {
        expect(clampToCeiling(d, d)).toBe(d);
      }),
      { numRuns: 1_000 },
    );
  });

  it("commutative-as-min: argument order does not change the resulting KIND", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (a, b) => {
        expect(clampToCeiling(a, b).kind).toBe(clampToCeiling(b, a).kind);
      }),
      { numRuns: 1_000 },
    );
  });

  it("returns one of its two inputs UNCHANGED — adds no field, synthesises no 7th outcome", () => {
    fc.assert(
      fc.property(decisionArb, decisionArb, (deterministic, ceiling) => {
        const out = clampToCeiling(deterministic, ceiling);
        // Referential: the result IS one of the two argument objects.
        expect(out === deterministic || out === ceiling).toBe(true);
        // Still one of the six closed kinds (no 7th outcome ever appears).
        expect(RATIFIED_ORDER).toContain(out.kind);
      }),
      { numRuns: 1_000 },
    );
  });

  it("REWRITE < REQUEST_CONFIRMATION holds under the clamp: confirmation ceiling raises a rewrite, rewrite ceiling never lowers a confirmation", () => {
    // The constitutional pair, exercised through the ceiling itself.
    const rewrite = sample("REWRITE");
    const confirm = sample("REQUEST_CONFIRMATION");
    expect(clampToCeiling(rewrite, confirm).kind).toBe("REQUEST_CONFIRMATION"); // raised
    expect(clampToCeiling(confirm, rewrite).kind).toBe("REQUEST_CONFIRMATION"); // not lowered
  });
});
