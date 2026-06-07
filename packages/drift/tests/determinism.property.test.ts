import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createDriftDetector } from "../src/index.js";
import { rec } from "./helpers.js";

const KINDS = ["EXECUTE", "REFUSE", "DEFER", "REWRITE"] as const;
const INTENTS = ["a", "b", "c"] as const;

const recordArb = fc.record({
  kind: fc.constantFrom(...KINDS),
  intent: fc.constantFrom(...INTENTS),
});

describe("drift determinism", () => {
  it("same record sequence → byte-identical snapshot + alerts", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { minLength: 0, maxLength: 60 }), (records) => {
        const make = () =>
          createDriftDetector({
            baselineWindow: 20,
            recentWindow: 20,
            alertThreshold: 0.2,
            dimensions: ["decision.kind", "intent.kind", "basis"],
          });
        const a = make();
        const b = make();
        for (const r of records) {
          a.observe(rec(r.kind, r.intent));
          b.observe(rec(r.kind, r.intent));
        }
        expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
        expect(JSON.stringify(a.evaluate())).toBe(JSON.stringify(b.evaluate()));
      }),
      { numRuns: 300 },
    );
  });
});
