import { describe, expect, it } from "vitest";
import {
  assertSafePattern,
  PII_PATTERNS_COMMON,
} from "../src/pii-patterns.js";

describe("assertSafePattern", () => {
  it("throws on classic nested unbounded quantifiers (ReDoS)", () => {
    expect(() => assertSafePattern(/(a+)+$/)).toThrow(/nested unbounded quantifier/);
    expect(() => assertSafePattern(/(a*)*/)).toThrow();
    expect(() => assertSafePattern(/(.*)+/)).toThrow();
    expect(() => assertSafePattern(/([a-z]+){2,}/)).toThrow();
    expect(() => assertSafePattern(/(\d+)+/)).toThrow();
  });

  it("accepts safe anchored/bounded patterns (no false positives)", () => {
    expect(() => assertSafePattern(/\b\d(?:[ -]?\d){12,18}\b/)).not.toThrow(); // PAN
    expect(() => assertSafePattern(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)).not.toThrow();
    expect(() => assertSafePattern(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)).not.toThrow(); // CPF
    expect(() => assertSafePattern(/\(\d{3}\)\s?\d{3}-\d{4}/)).not.toThrow(); // literal parens, optional outer
    expect(() => assertSafePattern(/(a+)?/)).not.toThrow(); // bounded outer quantifier is safe
  });

  it("surfaces the label in the error", () => {
    expect(() => assertSafePattern(/(a+)+/, "evil")).toThrow(/\(evil\)/);
  });
});

describe("PII_PATTERNS_COMMON", () => {
  const byId = Object.fromEntries(PII_PATTERNS_COMMON.map((p) => [p.id, p.pattern]));

  it("ships email, pan, phone — all ReDoS-safe", () => {
    expect(Object.keys(byId).sort()).toEqual(["email", "pan", "phone"]);
    for (const p of PII_PATTERNS_COMMON) expect(() => assertSafePattern(p.pattern, p.id)).not.toThrow();
  });

  it("matches representative positives and rejects negatives", () => {
    expect(byId.email!.test("reach me at jane.doe@example.co")).toBe(true);
    expect(byId.email!.test("no email here")).toBe(false);
    expect(byId.pan!.test("4111 1111 1111 1111")).toBe(true);
    expect(byId.pan!.test("just 42 apples")).toBe(false);
    expect(byId.phone!.test("+1 415 555 1234")).toBe(true);
  });
});
