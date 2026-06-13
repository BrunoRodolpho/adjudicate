import { describe, expect, it } from "vitest";
import { applyCostTable, type PriceTable } from "../src/index.js";

// $3 / 1M input, $15 / 1M output.
const PRICE: PriceTable = {
  inputUsdPerToken: 3 / 1_000_000,
  outputUsdPerToken: 15 / 1_000_000,
};

describe("applyCostTable", () => {
  it("prices input and output separately and sums them", () => {
    const c = applyCostTable({ promptConsumed: 1_000_000, completionConsumed: 1_000_000 }, PRICE);
    expect(c.inputUsd).toBeCloseTo(3, 9);
    expect(c.outputUsd).toBeCloseTo(15, 9);
    expect(c.usd).toBeCloseTo(18, 9);
  });

  it("treats missing / non-finite / negative counts as 0 (never over-estimates)", () => {
    expect(applyCostTable({}, PRICE)).toEqual({ inputUsd: 0, outputUsd: 0, usd: 0 });
    expect(applyCostTable({ promptConsumed: Number.NaN, completionConsumed: -5 }, PRICE)).toEqual({
      inputUsd: 0,
      outputUsd: 0,
      usd: 0,
    });
  });

  it("is pure / deterministic for the same inputs", () => {
    const v = { promptConsumed: 500, completionConsumed: 200 };
    expect(applyCostTable(v, PRICE)).toEqual(applyCostTable(v, PRICE));
  });
});
