/**
 * timingSafeHexEqual — constant-time digest comparison (SecurityReviewer-008).
 *
 * Pins the contract that the helper is a boolean-identical, throw-free
 * replacement for `===` on hex digest strings: equal bytes → true; any
 * difference, length mismatch, or non-string → false; NEVER throws (the
 * underlying crypto.timingSafeEqual throws on unequal-length buffers, which
 * the helper must guard).
 */

import { describe, expect, it } from "vitest";
import { timingSafeHexEqual } from "../src/index.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("timingSafeHexEqual", () => {
  it("returns true for byte-identical equal-length digests (constant-time branch)", () => {
    expect(timingSafeHexEqual(A, A)).toBe(true);
    expect(timingSafeHexEqual("deadbeef", "deadbeef")).toBe(true);
  });

  it("returns false for same-length but differing digests (forces the constant-time compare)", () => {
    expect(timingSafeHexEqual(A, B)).toBe(false);
    // Differ only in the LAST char — the whole point of constant-time is that
    // this still resolves to false (and, off the clock, without short-circuit).
    expect(timingSafeHexEqual("a".repeat(63) + "a", "a".repeat(63) + "b")).toBe(
      false,
    );
    // Differ only in the FIRST char.
    expect(timingSafeHexEqual("b" + "a".repeat(63), "a".repeat(64))).toBe(false);
  });

  it("returns false on length mismatch and NEVER throws (length-mismatch branch)", () => {
    // crypto.timingSafeEqual throws on unequal-length buffers; the helper must
    // guard and return false instead.
    expect(() => timingSafeHexEqual("dead", "deadbeef")).not.toThrow();
    expect(timingSafeHexEqual("dead", "deadbeef")).toBe(false);
    expect(timingSafeHexEqual(A, A + "a")).toBe(false);
    expect(timingSafeHexEqual("", A)).toBe(false);
  });

  it("returns false (never throws) for non-string / nullish inputs", () => {
    expect(timingSafeHexEqual(undefined, A)).toBe(false);
    expect(timingSafeHexEqual(A, undefined)).toBe(false);
    expect(timingSafeHexEqual(null, null)).toBe(false);
    expect(timingSafeHexEqual(123, A)).toBe(false);
    expect(timingSafeHexEqual({}, A)).toBe(false);
  });

  it("agrees with === for every same-length input (pure comparison hardening)", () => {
    const cases: Array<[string, string]> = [
      [A, A],
      [A, B],
      ["deadbeef", "deadbeef"],
      ["deadbeef", "deadbee0"],
      ["", ""],
    ];
    for (const [x, y] of cases) {
      expect(timingSafeHexEqual(x, y)).toBe(x === y);
    }
  });
});
