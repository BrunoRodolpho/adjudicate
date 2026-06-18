import { describe, expect, it } from "vitest";
import { assertSafePattern, PII_PATTERNS_COMMON } from "../src/index.js";

/**
 * ReDoS regression (ADR-141). Each shipped PII pattern MUST stay linear: a
 * catastrophic-backtracking reintroduction would block the SYNCHRONOUS decision
 * path for seconds (these patterns run inside `adjudicate()` as a business
 * guard over attacker-influenced free text). `assertSafePattern` only spot-checks
 * the nested-quantifier shape, so this wall-clock budget is the real guard. The
 * historical quadratic email pattern took ~27s on a 200KB input; a linear one is
 * sub-50ms, so the generous budget below has a multiple-order-of-magnitude margin
 * yet still fails hard on a quadratic reintroduction.
 */
describe("PII_PATTERNS_COMMON — ReDoS safety", () => {
  const BUDGET_MS = 1000;
  // Inputs crafted to trigger backtracking in the historical quadratic shapes.
  const adversarial = [
    "a".repeat(200_000),
    `a@${"b.".repeat(100_000)}`, // greedy domain run with no valid TLD at the \b
    "a.".repeat(100_000), // greedy local run that never finds an '@'
    `${"a@b.".repeat(2_000)}${"c".repeat(200_000)}`,
    "0".repeat(200_000),
    " ".repeat(200_000),
  ];

  for (const { id, pattern } of PII_PATTERNS_COMMON) {
    it(`'${id}' resists ReDoS on large adversarial inputs (< ${BUDGET_MS}ms)`, () => {
      for (const input of adversarial) {
        const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
        const start = performance.now();
        re.test(input);
        const elapsed = performance.now() - start;
        expect(
          elapsed,
          `pattern '${id}' on a ${input.length}-char input took ${elapsed.toFixed(0)}ms (quadratic regression?)`,
        ).toBeLessThan(BUDGET_MS);
      }
    });
  }

  it("the shipped patterns still pass assertSafePattern and match real PII", () => {
    for (const p of PII_PATTERNS_COMMON) assertSafePattern(p.pattern, p.id);
    const email = PII_PATTERNS_COMMON.find((p) => p.id === "email")!.pattern;
    const test = (s: string) => new RegExp(email.source, email.flags.replace("g", "")).test(s);
    expect(test("john.doe@example.com")).toBe(true);
    expect(test("a@b.co")).toBe(true);
    expect(test("user.name+tag@mail.example.co.uk")).toBe(true);
    expect(test("not-an-email")).toBe(false);
    expect(test("plainaddress@")).toBe(false);
  });
});
