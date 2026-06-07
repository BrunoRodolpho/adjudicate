import { describe, expect, it } from "vitest";
import { PUBLIC_COHORT_FLOOR } from "./public-projection";
import { projectPiiTransparency } from "./pii-transparency";
import {
  PII_TRANSPARENCY_SAMPLE,
  type PiiTransparencyRow,
} from "./transparency-fixtures";

describe("projectPiiTransparency", () => {
  it("censors small non-zero cohorts as \"<N\" and floors their value", () => {
    const buckets = projectPiiTransparency([
      { sensitivityLevel: "critical", disposition: "redacted", count: 3 },
      { sensitivityLevel: "low", disposition: "redacted", count: 1842 },
    ]);

    const small = buckets.find(
      (b) => b.sensitivityLevel === "critical" && b.disposition === "redacted",
    );
    expect(small).toBeDefined();
    expect(small?.censored).toBe(true);
    expect(small?.display).toBe(`<${PUBLIC_COHORT_FLOOR}`);
    // Floored value, never the exact small count.
    expect(small?.value).toBe(PUBLIC_COHORT_FLOOR);

    const large = buckets.find(
      (b) => b.sensitivityLevel === "low" && b.disposition === "redacted",
    );
    expect(large?.censored).toBe(false);
    expect(large?.display).toBe("1842");
    expect(large?.value).toBe(1842);
  });

  it("exercises the floor on the committed sample (has a <5 cohort)", () => {
    const buckets = projectPiiTransparency(PII_TRANSPARENCY_SAMPLE);
    expect(buckets.some((b) => b.censored)).toBe(true);
    expect(buckets.some((b) => b.display === `<${PUBLIC_COHORT_FLOOR}`)).toBe(
      true,
    );
  });

  it("never emits raw value/field/hash keys — only closed-enum labels + counts", () => {
    const buckets = projectPiiTransparency(PII_TRANSPARENCY_SAMPLE);
    const allowedKeys = new Set([
      "label",
      "value",
      "censored",
      "display",
      "sensitivityLevel",
      "disposition",
      "sensitivityLabel",
      "dispositionLabel",
    ]);
    const forbidden = ["value_raw", "field", "fieldName", "hash", "raw", "text"];

    for (const bucket of buckets) {
      for (const key of Object.keys(bucket)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      for (const key of forbidden) {
        expect(Object.prototype.hasOwnProperty.call(bucket, key)).toBe(false);
      }
      // Disposition is a strict closed enum.
      expect(["redacted", "blocked"]).toContain(bucket.disposition);
      expect(["low", "medium", "high", "critical"]).toContain(
        bucket.sensitivityLevel,
      );
    }
  });

  it("is order-stable and deterministic", () => {
    const shuffled: PiiTransparencyRow[] = [
      { sensitivityLevel: "high", disposition: "blocked", count: 41 },
      { sensitivityLevel: "low", disposition: "redacted", count: 1842 },
      { sensitivityLevel: "critical", disposition: "blocked", count: 29 },
      { sensitivityLevel: "medium", disposition: "redacted", count: 936 },
    ];

    const a = projectPiiTransparency(shuffled);
    const b = projectPiiTransparency([...shuffled].reverse());

    // Same canonical (sensitivity → disposition) order regardless of input order.
    expect(a.map((x) => `${x.sensitivityLevel}/${x.disposition}`)).toEqual([
      "low/redacted",
      "medium/redacted",
      "high/blocked",
      "critical/blocked",
    ]);
    expect(a).toEqual(b);
  });

  it("sums duplicate (sensitivity, disposition) rows before censoring", () => {
    const buckets = projectPiiTransparency([
      { sensitivityLevel: "high", disposition: "redacted", count: 2 },
      { sensitivityLevel: "high", disposition: "redacted", count: 4 },
    ]);
    expect(buckets).toHaveLength(1);
    const [bucket] = buckets;
    expect(bucket).toBeDefined();
    // 2 + 4 = 6, above the floor → exact.
    expect(bucket?.value).toBe(6);
    expect(bucket?.censored).toBe(false);
    expect(bucket?.display).toBe("6");
  });
});
