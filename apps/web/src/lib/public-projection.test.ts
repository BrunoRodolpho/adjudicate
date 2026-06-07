import { describe, expect, it } from "vitest";
import {
  PUBLIC_COHORT_FLOOR,
  clampCohort,
  isCensored,
  publicCountLabel,
  toPublicBuckets,
} from "./public-projection";

describe("public-projection cohort floor", () => {
  it("censors small non-zero counts", () => {
    expect(isCensored(0)).toBe(false);
    expect(isCensored(1)).toBe(true);
    expect(isCensored(PUBLIC_COHORT_FLOOR - 1)).toBe(true);
    expect(isCensored(PUBLIC_COHORT_FLOOR)).toBe(false);
    expect(isCensored(100)).toBe(false);
  });

  it("labels counts fail-safe (0 / <5 / exact)", () => {
    expect(publicCountLabel(0)).toBe("0");
    expect(publicCountLabel(-3)).toBe("0");
    expect(publicCountLabel(Number.NaN)).toBe("0");
    expect(publicCountLabel(Number.POSITIVE_INFINITY)).toBe("0");
    expect(publicCountLabel(3)).toBe("<5");
    expect(publicCountLabel(5)).toBe("5");
    expect(publicCountLabel(42)).toBe("42");
  });

  it("clamps small cohorts up to the floor for chart marks", () => {
    expect(clampCohort(0)).toBe(0);
    expect(clampCohort(2)).toBe(PUBLIC_COHORT_FLOOR);
    expect(clampCohort(9)).toBe(9);
    expect(clampCohort(-1)).toBe(0);
  });

  it("projects aggregate rows into public buckets", () => {
    const buckets = toPublicBuckets([
      { label: "high", count: 2 },
      { label: "low", count: 12 },
      { label: "none", count: 0 },
    ]);
    expect(buckets).toEqual([
      { label: "high", value: 5, censored: true, display: "<5" },
      { label: "low", value: 12, censored: false, display: "12" },
      { label: "none", value: 0, censored: false, display: "0" },
    ]);
  });
});
