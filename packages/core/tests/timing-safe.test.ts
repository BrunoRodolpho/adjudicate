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
import {
  bindCapability,
  capabilityPreimage,
  timingSafeHexEqual,
  verifyCapability,
} from "../src/index.js";
import { sha256Canonical } from "../src/hash.js";

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

describe("021 — verifyCapability (constant-time, fail-safe hash-bind leg)", () => {
  const body = {
    intentHash: "a".repeat(64),
    kernelId: "kernel://prod/us-east-1",
  };
  const cap = bindCapability(body, "key-1");

  it("a freshly-bound capability verifies", () => {
    expect(verifyCapability(cap)).toBe(true);
  });

  it("the bound signature value IS the hash of the pre-image (non-vacuous)", () => {
    // Pin that bind/verify are not trivially true: the value equals the genuine
    // sha256 over the pre-image string, not some constant.
    expect(cap.signature.value).toBe(sha256Canonical(capabilityPreimage(body)));
    expect(cap.signature.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a tampered intentHash fails (re-derived pre-image no longer matches)", () => {
    expect(verifyCapability({ ...cap, intentHash: "b".repeat(64) })).toBe(false);
  });

  it("a tampered kernelId fails", () => {
    expect(verifyCapability({ ...cap, kernelId: "kernel://attacker" })).toBe(
      false,
    );
  });

  it("a tampered signature value fails", () => {
    expect(
      verifyCapability({
        ...cap,
        signature: { ...cap.signature, value: "c".repeat(64) },
      }),
    ).toBe(false);
  });

  it("a tampered FIRST char of the signature still fails (constant-time, no early-exit)", () => {
    const flipped = "0" + cap.signature.value.slice(1);
    expect(flipped).not.toBe(cap.signature.value);
    expect(
      verifyCapability({ ...cap, signature: { ...cap.signature, value: flipped } }),
    ).toBe(false);
  });

  it("length-mismatch / non-string signature value returns false WITHOUT throwing", () => {
    expect(() =>
      verifyCapability({ ...cap, signature: { ...cap.signature, value: "short" } }),
    ).not.toThrow();
    expect(
      verifyCapability({ ...cap, signature: { ...cap.signature, value: "short" } }),
    ).toBe(false);
    expect(
      verifyCapability({
        ...cap,
        // intentionally malformed shape
        signature: { ...cap.signature, value: 123 as unknown as string },
      }),
    ).toBe(false);
  });

  it("malformed / missing fields return false without throwing", () => {
    expect(() => verifyCapability(null)).not.toThrow();
    expect(verifyCapability(null)).toBe(false);
    expect(verifyCapability(undefined)).toBe(false);
    expect(verifyCapability(42)).toBe(false);
    expect(verifyCapability({})).toBe(false);
    expect(verifyCapability({ intentHash: "a".repeat(64) })).toBe(false); // no kernelId / sig
    expect(verifyCapability({ ...body, signature: null })).toBe(false);
  });
});
