import { describe, expect, it } from "vitest";
import { ssnPattern, usPiiPatterns } from "../src/index.js";

describe("en-US PII patterns", () => {
  it("ssnPattern matches SSNs with and without separators", () => {
    expect(ssnPattern.pattern.test("123-45-6789")).toBe(true);
    expect(ssnPattern.pattern.test("123 45 6789")).toBe(true);
    expect(ssnPattern.pattern.test("123456789")).toBe(true);
  });

  it("ssnPattern rejects non-SSN strings", () => {
    expect(ssnPattern.pattern.test("12-345-6789")).toBe(false);
    expect(ssnPattern.pattern.test("no number")).toBe(false);
  });

  it("usPiiPatterns bundles the ssn pattern", () => {
    expect(usPiiPatterns.map((p) => p.id)).toEqual(["ssn"]);
  });
});
