import { describe, expect, it } from "vitest";
import { totalVariationDistance } from "../src/index.js";

describe("totalVariationDistance", () => {
  it("identical distributions → 0", () => {
    expect(totalVariationDistance({ a: 3, b: 1 }, { a: 6, b: 2 })).toBe(0);
  });
  it("disjoint distributions → 1", () => {
    expect(totalVariationDistance({ a: 5 }, { b: 5 })).toBe(1);
  });
  it("both empty → 0; one empty → 1", () => {
    expect(totalVariationDistance({}, {})).toBe(0);
    expect(totalVariationDistance({ a: 1 }, {})).toBe(1);
  });
  it("is symmetric and normalized to proportions", () => {
    const a = { x: 1, y: 1 };
    const b = { x: 3, y: 1 };
    expect(totalVariationDistance(a, b)).toBeCloseTo(totalVariationDistance(b, a), 12);
    expect(totalVariationDistance(a, b)).toBeCloseTo(0.25, 12);
  });
});
