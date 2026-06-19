import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applySessionContamination,
  canPropose,
  contaminateSession,
  isContaminatingOrigin,
  meetAll,
  mergeTaint,
  type Origin,
  type SessionContamination,
  type Taint,
  type TaintPolicy,
} from "../src/taint.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const originArb = fc.constantFrom<Origin>(
  "Human",
  "Retrieved",
  "ExternalAPI",
  "LLM",
  "System",
);
const RANK: Record<Taint, number> = { SYSTEM: 3, TRUSTED: 2, UNTRUSTED: 1 };

describe("mergeTaint — lattice algebra", () => {
  it("is commutative", () => {
    // The Taint domain has exactly 3 values, so the (a, b) space is 3×3 = 9
    // pairs. 9 runs exhausts it deterministically — more would only re-draw
    // already-covered inputs.
    fc.assert(
      fc.property(taintArb, taintArb, (a, b) => {
        expect(mergeTaint(a, b)).toBe(mergeTaint(b, a));
      }),
      { numRuns: 9 },
    );
  });

  it("is associative", () => {
    fc.assert(
      fc.property(taintArb, taintArb, taintArb, (a, b, c) => {
        expect(mergeTaint(mergeTaint(a, b), c)).toBe(
          mergeTaint(a, mergeTaint(b, c)),
        );
      }),
      { numRuns: 27 }, // 3^3 = 27 triples — exhausts the state space
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(taintArb, (t) => {
        expect(mergeTaint(t, t)).toBe(t);
      }),
      { numRuns: 3 }, // 3 values — exhausted in 3 runs
    );
  });

  it("is monotonic — never raises trust", () => {
    fc.assert(
      fc.property(taintArb, taintArb, (a, b) => {
        const merged = mergeTaint(a, b);
        expect(RANK[merged]).toBeLessThanOrEqual(Math.min(RANK[a], RANK[b]));
      }),
      { numRuns: 9 }, // 3^2 = 9 pairs — exhausts the state space
    );
  });

  it("lowest-trust-wins on canonical pairs", () => {
    expect(mergeTaint("SYSTEM", "UNTRUSTED")).toBe("UNTRUSTED");
    expect(mergeTaint("TRUSTED", "UNTRUSTED")).toBe("UNTRUSTED");
    expect(mergeTaint("SYSTEM", "TRUSTED")).toBe("TRUSTED");
    expect(mergeTaint("SYSTEM", "SYSTEM")).toBe("SYSTEM");
  });
});

describe("meetAll", () => {
  it("returns SYSTEM for empty input (nothing untrusted present)", () => {
    expect(meetAll([])).toBe("SYSTEM");
  });

  it("returns the single value for singleton input", () => {
    expect(meetAll(["TRUSTED"])).toBe("TRUSTED");
    expect(meetAll(["UNTRUSTED"])).toBe("UNTRUSTED");
  });

  it("collapses via mergeTaint across the list", () => {
    fc.assert(
      fc.property(fc.array(taintArb, { minLength: 1, maxLength: 8 }), (ts) => {
        const expected = ts.reduce((acc, t) => mergeTaint(acc, t));
        expect(meetAll(ts)).toBe(expected);
      }),
      { numRuns: 100 }, // 100 random arrays; space is small, coverage is adequate
    );
  });
});

describe("canPropose", () => {
  const policy: TaintPolicy = {
    minimumFor: (kind) => {
      if (kind === "payment.send") return "SYSTEM";
      if (kind === "order.submit") return "TRUSTED";
      return "UNTRUSTED";
    },
  };

  it("blocks UNTRUSTED from proposing a TRUSTED-minimum intent", () => {
    expect(canPropose("UNTRUSTED", "order.submit", policy)).toBe(false);
  });

  it("blocks TRUSTED from proposing a SYSTEM-minimum intent", () => {
    expect(canPropose("TRUSTED", "payment.send", policy)).toBe(false);
  });

  it("allows SYSTEM to propose any intent", () => {
    expect(canPropose("SYSTEM", "payment.send", policy)).toBe(true);
    expect(canPropose("SYSTEM", "order.submit", policy)).toBe(true);
    expect(canPropose("SYSTEM", "browse", policy)).toBe(true);
  });

  it("allows UNTRUSTED to propose an UNTRUSTED-minimum intent (e.g. read-only)", () => {
    expect(canPropose("UNTRUSTED", "browse", policy)).toBe(true);
  });
});

// ── 042: session contamination ──────────────────────────────────────────────

describe("isContaminatingOrigin", () => {
  it("treats Retrieved and ExternalAPI as contaminating", () => {
    expect(isContaminatingOrigin("Retrieved")).toBe(true);
    expect(isContaminatingOrigin("ExternalAPI")).toBe(true);
  });

  it("treats first-party / model sources as non-contaminating", () => {
    expect(isContaminatingOrigin("Human")).toBe(false);
    expect(isContaminatingOrigin("System")).toBe(false);
    expect(isContaminatingOrigin("LLM")).toBe(false);
  });
});

describe("applySessionContamination", () => {
  it("passes the declared taint through unchanged when no flag is set", () => {
    fc.assert(
      fc.property(taintArb, (declared) => {
        expect(applySessionContamination(declared, undefined)).toBe(declared);
      }),
      { numRuns: 3 },
    );
  });

  it("lowers the minted taint to the meet of declared and contamination", () => {
    fc.assert(
      fc.property(taintArb, taintArb, originArb, (declared, ct, origin) => {
        const flag: SessionContamination = { taint: ct, origin };
        expect(applySessionContamination(declared, flag)).toBe(
          mergeTaint(declared, ct),
        );
      }),
      { numRuns: 45 }, // 3 × 3 × 5
    );
  });

  it("is monotonic — contamination NEVER raises trust above the declared taint", () => {
    fc.assert(
      fc.property(taintArb, taintArb, originArb, (declared, ct, origin) => {
        const flag: SessionContamination = { taint: ct, origin };
        const minted = applySessionContamination(declared, flag);
        // The minted taint can never outrank the declared taint (no laundering).
        expect(RANK[minted]).toBeLessThanOrEqual(RANK[declared]);
      }),
      { numRuns: 45 },
    );
  });

  it("a TRUSTED declared intent in an UNTRUSTED-contaminated session is lowered to UNTRUSTED", () => {
    const flag: SessionContamination = { taint: "UNTRUSTED", origin: "Retrieved" };
    expect(applySessionContamination("TRUSTED", flag)).toBe("UNTRUSTED");
    expect(applySessionContamination("SYSTEM", flag)).toBe("UNTRUSTED");
  });
});

describe("contaminateSession", () => {
  it("does NOT contaminate on a non-contaminating origin (Human/System/LLM)", () => {
    for (const origin of ["Human", "System", "LLM"] as const) {
      expect(
        contaminateSession(undefined, { origin, taint: "UNTRUSTED" }),
      ).toBeUndefined();
    }
  });

  it("sets the flag on the first contaminating datum, preserving the source", () => {
    const flag = contaminateSession(undefined, {
      origin: "Retrieved",
      taint: "UNTRUSTED",
    });
    expect(flag).toEqual({ taint: "UNTRUSTED", origin: "Retrieved" });
  });

  it("ExternalAPI also contaminates", () => {
    const flag = contaminateSession(undefined, {
      origin: "ExternalAPI",
      taint: "TRUSTED",
    });
    expect(flag).toEqual({ taint: "TRUSTED", origin: "ExternalAPI" });
  });

  it("a non-contaminating datum leaves an already-set flag untouched", () => {
    const prior: SessionContamination = {
      taint: "UNTRUSTED",
      origin: "Retrieved",
    };
    expect(
      contaminateSession(prior, { origin: "Human", taint: "SYSTEM" }),
    ).toBe(prior);
  });

  it("folds monotonically — accumulated taint only ever tightens, source anchor is the FIRST", () => {
    // Start with a TRUSTED-contaminating ExternalAPI datum, then a more-untrusted
    // Retrieved datum. The taint must drop to UNTRUSTED; the origin stays the first.
    const first = contaminateSession(undefined, {
      origin: "ExternalAPI",
      taint: "TRUSTED",
    });
    const second = contaminateSession(first, {
      origin: "Retrieved",
      taint: "UNTRUSTED",
    });
    expect(second).toEqual({ taint: "UNTRUSTED", origin: "ExternalAPI" });
  });

  it("monotonicity property — folding any contaminating datum never raises the running taint", () => {
    fc.assert(
      fc.property(
        taintArb,
        fc.array(
          fc.record({
            origin: fc.constantFrom<Origin>("Retrieved", "ExternalAPI"),
            taint: taintArb,
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (seedTaint, data) => {
          let flag: SessionContamination | undefined = {
            taint: seedTaint,
            origin: "Retrieved",
          };
          let prevRank = RANK[flag.taint];
          for (const d of data) {
            flag = contaminateSession(flag, d);
            // flag is always defined here (seeded + only contaminating data).
            const rank = RANK[(flag as SessionContamination).taint];
            expect(rank).toBeLessThanOrEqual(prevRank);
            prevRank = rank;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
