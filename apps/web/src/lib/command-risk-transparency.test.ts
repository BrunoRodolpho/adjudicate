import { describe, expect, it } from "vitest";
import { PUBLIC_COHORT_FLOOR } from "./public-projection";
import { projectCommandRiskTransparency } from "./command-risk-transparency";
import {
  COMMAND_RISK_TRANSPARENCY_SAMPLE,
  type CommandRiskTransparencyRow,
} from "./transparency-fixtures";

describe("projectCommandRiskTransparency", () => {
  it("censors small non-zero cohorts as \"<N\" and floors their value", () => {
    const buckets = projectCommandRiskTransparency([
      { category: "credential", count: 4 },
      { category: "destructive", count: 312 },
    ]);

    const small = buckets.find((b) => b.category === "credential");
    expect(small).toBeDefined();
    expect(small?.censored).toBe(true);
    expect(small?.display).toBe(`<${PUBLIC_COHORT_FLOOR}`);
    // Floored value, never the exact small count.
    expect(small?.value).toBe(PUBLIC_COHORT_FLOOR);

    const large = buckets.find((b) => b.category === "destructive");
    expect(large?.censored).toBe(false);
    expect(large?.display).toBe("312");
    expect(large?.value).toBe(312);
  });

  it("exercises the floor on the committed sample (has a <5 cohort)", () => {
    const buckets = projectCommandRiskTransparency(
      COMMAND_RISK_TRANSPARENCY_SAMPLE,
    );
    expect(buckets.some((b) => b.censored)).toBe(true);
    expect(buckets.some((b) => b.display === `<${PUBLIC_COHORT_FLOOR}`)).toBe(
      true,
    );
  });

  it("NEVER emits command text, rule ids, disposition, or any raw key — category + counts only", () => {
    const buckets = projectCommandRiskTransparency(
      COMMAND_RISK_TRANSPARENCY_SAMPLE,
    );
    const allowedKeys = new Set([
      "label",
      "value",
      "censored",
      "display",
      "category",
      "categoryLabel",
    ]);
    const forbidden = [
      "command",
      "matchedRuleIds",
      "ruleId",
      "rule",
      "disposition",
      "sanitized",
      "stripped",
      "at",
      "intentHash",
      "raw",
      "text",
    ];

    for (const bucket of buckets) {
      for (const key of Object.keys(bucket)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      for (const key of forbidden) {
        expect(Object.prototype.hasOwnProperty.call(bucket, key)).toBe(false);
      }
      // Category is a strict closed enum (mirrors the kernel taxonomy).
      expect(["destructive", "network", "credential", "safe"]).toContain(
        bucket.category,
      );
    }

    // Defense-in-depth: a representative live secret / rule id never appears in
    // the serialized projection.
    const json = JSON.stringify(buckets);
    expect(json).not.toContain("AWS_SECRET");
    expect(json).not.toContain("rm_rf");
    expect(json).not.toContain("blocked");
    expect(json).not.toContain("confirm");
  });

  it("is order-stable and deterministic (severity order, safe last)", () => {
    const shuffled: CommandRiskTransparencyRow[] = [
      { category: "safe", count: 0 },
      { category: "network", count: 87 },
      { category: "destructive", count: 312 },
      { category: "credential", count: 4 },
    ];

    const a = projectCommandRiskTransparency(shuffled);
    const b = projectCommandRiskTransparency([...shuffled].reverse());

    expect(a.map((x) => x.category)).toEqual([
      "destructive",
      "credential",
      "network",
      "safe",
    ]);
    expect(a).toEqual(b);
  });

  it("sums duplicate category rows before censoring", () => {
    const buckets = projectCommandRiskTransparency([
      { category: "network", count: 2 },
      { category: "network", count: 4 },
    ]);
    expect(buckets).toHaveLength(1);
    const [bucket] = buckets;
    expect(bucket).toBeDefined();
    expect(bucket?.value).toBe(6);
    expect(bucket?.censored).toBe(false);
    expect(bucket?.display).toBe("6");
  });

  it("renders a zero category as \"0\", not censored", () => {
    const buckets = projectCommandRiskTransparency([{ category: "safe", count: 0 }]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.display).toBe("0");
    expect(buckets[0]?.censored).toBe(false);
    expect(buckets[0]?.value).toBe(0);
  });
});
