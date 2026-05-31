import { describe, expect, it } from "vitest";
import { normalizeTimestamptz } from "../src/pg-types.js";

describe("normalizeTimestamptz", () => {
  // ── Happy paths ──────────────────────────────────────────────────────────

  it("passes through an ISO-8601 string verbatim", () => {
    expect(normalizeTimestamptz("2026-05-21T10:00:00.000Z")).toBe(
      "2026-05-21T10:00:00.000Z",
    );
  });

  it("coerces a Date to its ISO-8601 string", () => {
    const d = new Date("2026-05-21T10:00:00.000Z");
    expect(normalizeTimestamptz(d)).toBe("2026-05-21T10:00:00.000Z");
  });

  // DataReviewer-013 (option B): a Postgres TIMESTAMPTZ wire string (space
  // separator, `+00` offset, possible microsecond precision) is NOT byte-equal
  // to the canonical JS ISO-8601 `at` that was hashed at write time. Returning
  // it verbatim makes `record.at` diverge from the hashed value and
  // verifyAuditRecord report a false-positive tamper on read-back. The helper
  // now parse-and-reemits to canonical ISO so the round-trip is faithful.
  it("coerces a Postgres wire-format string to canonical ISO-8601", () => {
    expect(normalizeTimestamptz("2026-05-21 10:00:00+00")).toBe(
      "2026-05-21T10:00:00.000Z",
    );
  });

  it("coerces the `+00:00` offset wire form to canonical ISO-8601", () => {
    expect(normalizeTimestamptz("2026-05-21 10:00:00+00:00")).toBe(
      "2026-05-21T10:00:00.000Z",
    );
  });

  it("truncates microsecond precision to milliseconds (the hashed `at` is ms-precision)", () => {
    expect(normalizeTimestamptz("2026-05-21 10:00:00.123456+00")).toBe(
      "2026-05-21T10:00:00.123Z",
    );
  });

  it("is idempotent for a canonical ISO-8601 string (golden vectors do not move)", () => {
    expect(normalizeTimestamptz("2026-05-18T00:00:00.000Z")).toBe(
      "2026-05-18T00:00:00.000Z",
    );
  });

  it("throws when a string is not a parseable timestamp (driver bug / contract misuse)", () => {
    expect(() => normalizeTimestamptz("not-a-timestamp", "intent_audit.recorded_at")).toThrow(
      /unexpected TIMESTAMPTZ value.*\(column: intent_audit\.recorded_at\)/,
    );
  });

  // ── Diagnostic error paths ────────────────────────────────────────────────

  it("throws with type info when the value is undefined", () => {
    expect(() => normalizeTimestamptz(undefined)).toThrow(
      /unexpected TIMESTAMPTZ value.*got undefined: undefined/,
    );
  });

  it("throws with type info when the value is a number (epoch ms drift)", () => {
    expect(() => normalizeTimestamptz(1716_300_000_000)).toThrow(
      /unexpected TIMESTAMPTZ value.*got number: 1716300000000/,
    );
  });

  it("throws with literal 'null' when the value is null", () => {
    expect(() => normalizeTimestamptz(null)).toThrow(
      /unexpected TIMESTAMPTZ value.*got null/,
    );
  });

  it("includes the column name in the error when supplied", () => {
    expect(() => normalizeTimestamptz(42, "intent_audit.recorded_at")).toThrow(
      /\(column: intent_audit\.recorded_at\)/,
    );
  });

  it("truncates oversized samples to 80 chars to keep error logs bounded", () => {
    // Wrap a long string inside a non-string carrier so the rejection path
    // is exercised (strings pass through verbatim — truncation only applies
    // when the helper has to serialize an unexpected type).
    const big = { driverPayload: "x".repeat(200) };
    try {
      normalizeTimestamptz(big);
      throw new Error("expected normalizeTimestamptz to throw");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The truncation rule is: > 80 chars → first 77 chars + "..."
      expect(msg).toMatch(/\.\.\."$|\.\.\.$/);
      expect(msg).toContain("xxxxxxxxxxxx"); // some run of x's survived
      // The full 200-char value is NOT spelled out in the error.
      expect(msg.length).toBeLessThan(JSON.stringify(big).length + 100);
    }
  });

  it("serializes object samples via JSON.stringify (subject to truncation)", () => {
    const obj = { driverInternal: "wrong shape", id: 7 };
    expect(() => normalizeTimestamptz(obj, "governance_events.at")).toThrow(
      /\(column: governance_events\.at\).*\{"driverInternal":"wrong shape","id":7\}/,
    );
  });

  it("survives an unserializable value without secondary crashes", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => normalizeTimestamptz(circular)).toThrow(
      /<unserializable>/,
    );
  });
});
