import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  generateAllVectors,
  generatePromptInjectionEnvelopes,
  runRedTeam,
} from "../src/index.js";
import { strictStubPack } from "./helpers.js";

const pack = strictStubPack();

describe("red-team determinism", () => {
  it("same seed → byte-identical scenarios", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const a = generatePromptInjectionEnvelopes(pack, { seed, perIntent: 3 });
        const b = generatePromptInjectionEnvelopes(pack, { seed, perIntent: 3 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 200 },
    );
  });

  it("runRedTeam is deterministic over the same scenarios", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const scenarios = generateAllVectors(pack, { seed });
        const a = runRedTeam(pack, scenarios);
        const b = runRedTeam(pack, scenarios);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 100 },
    );
  });
});
