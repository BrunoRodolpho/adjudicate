import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import type { Taint } from "@adjudicate/core";
import {
  createDataClassificationGuard,
  type DataClassificationPattern,
} from "../src/index.js";

const at = "2026-04-29T12:00:00.000Z";
const SSN: DataClassificationPattern = { id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ };

function env(payload: unknown, taint: Taint = "UNTRUSTED") {
  return buildEnvelope({
    kind: "test.submit",
    payload,
    actor: { principal: "llm", sessionId: "sess" },
    taint,
    nonce: "n-1",
    createdAt: at,
  });
}

describe("createDataClassificationGuard — adversarial / negative", () => {
  it("does not throw on non-object payloads (returns null)", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REFUSE",
      sensitivityLevel: "high",
    });
    expect(guard(env("123-45-6789"), null)).toBeNull();
    expect(guard(env(42), null)).toBeNull();
    expect(guard(env(null), null)).toBeNull();
    expect(guard(env([1, 2, 3]), null)).toBeNull();
  });

  it("does not redact PII in a field outside scannedFields (scope honored)", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    // PII only in `secret`, which is not scanned → no opinion, value untouched.
    expect(guard(env({ note: "clean", secret: "123-45-6789" }), null)).toBeNull();
  });

  it("resolves nested dotted paths unambiguously (no literal-key collision)", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["a.b"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    // Nested a.b is redacted; a literal top-level key "a.b" is NOT targeted.
    const nested = guard(env({ a: { b: "ssn 123-45-6789" }, "a.b": "ssn 999-88-7777" }), null);
    if (nested?.kind !== "REWRITE") throw new Error("expected REWRITE");
    const p = nested.rewritten.payload as { a: { b: string }; "a.b": string };
    expect(p.a.b).toBe("ssn [REDACTED]");
    expect(p["a.b"]).toBe("ssn 999-88-7777"); // literal dotted key untouched
  });

  it("completes promptly on long inputs (linear patterns, no catastrophic backtracking)", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    const long = "a".repeat(100_000) + " 123-45-6789";
    const start = Date.now();
    const decision = guard(env({ note: long }), null);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(decision?.kind).toBe("REWRITE");
  });

  it("preserves taint verbatim on REWRITE for every lattice level", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    for (const taint of ["UNTRUSTED", "TRUSTED", "SYSTEM"] as const) {
      const decision = guard(env({ note: "ssn 123-45-6789" }, taint), null);
      if (decision?.kind !== "REWRITE") throw new Error("expected REWRITE");
      expect(decision.rewritten.taint).toBe(taint);
    }
  });
});
