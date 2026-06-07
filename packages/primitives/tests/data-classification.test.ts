import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import type { Taint } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import {
  createDataClassificationGuard,
  type DataClassificationPattern,
} from "../src/index.js";

const at = "2026-04-29T12:00:00.000Z";

const SSN: DataClassificationPattern = { id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ };
const PAN: DataClassificationPattern = { id: "pan", pattern: /\b\d{16}\b/ };

function env<P>(payload: P, taint: Taint = "UNTRUSTED", nonce = "n-1") {
  return buildEnvelope({
    kind: "test.submit",
    payload,
    actor: { principal: "llm", sessionId: "sess" },
    taint,
    nonce,
    createdAt: at,
  });
}

describe("createDataClassificationGuard — engagement", () => {
  it("returns null when matches() is false", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => false,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REFUSE",
      sensitivityLevel: "high",
    });
    expect(guard(env({ note: "ssn 123-45-6789" }), null)).toBeNull();
  });

  it("returns null when no pattern matches a scanned field", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    expect(guard(env({ note: "nothing sensitive here" }), null)).toBeNull();
  });

  it("returns null when the scanned field is absent or non-string", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REFUSE",
      sensitivityLevel: "high",
    });
    expect(guard(env({ other: "123-45-6789" }), null)).toBeNull();
    expect(guard(env({ note: 42 }), null)).toBeNull();
  });
});

describe("createDataClassificationGuard — REWRITE", () => {
  it("masks only matched fields and passes others through, preserving envelope identity", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note", "other"],
      action: "REWRITE",
      sensitivityLevel: "critical",
    });
    const original = env({ note: "ssn 123-45-6789", other: "keep me" }, "UNTRUSTED", "nonce-x");
    const decision = guard(original, null);
    expect(decision?.kind).toBe("REWRITE");
    if (decision?.kind !== "REWRITE") throw new Error("unreachable");
    const payload = decision.rewritten.payload as { note: string; other: string };
    expect(payload.note).toBe("ssn [REDACTED]");
    expect(payload.other).toBe("keep me");
    // Envelope identity preserved; taint never raised/lowered.
    expect(decision.rewritten.taint).toBe(original.taint);
    expect(decision.rewritten.nonce).toBe(original.nonce);
    expect(decision.rewritten.actor).toEqual(original.actor);
    expect(decision.rewritten.createdAt).toBe(original.createdAt);
    expect(decision.rewritten.intentHash).not.toBe(original.intentHash);
    // basis carries sensitivityLevel + redactedFields for the console.
    const b = decision.basis[0]!;
    expect(b.category).toBe("validation");
    expect(b.code).toBe("pii_redacted");
    expect(b.detail).toMatchObject({
      sensitivityLevel: "critical",
      redactedFields: ["note"],
      detectedPatterns: ["ssn"],
    });
  });

  it("applies a custom redact function", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [{ id: "ssn", pattern: /(\d{3})-\d{2}-(\d{4})/, redact: (m) => `***-**-${m.slice(-4)}` }],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    const decision = guard(env({ note: "123-45-6789" }), null);
    if (decision?.kind !== "REWRITE") throw new Error("expected REWRITE");
    expect((decision.rewritten.payload as { note: string }).note).toBe("***-**-6789");
  });

  it("resolves nested dotted paths", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["items.0.memo"],
      action: "REWRITE",
      sensitivityLevel: "medium",
    });
    const decision = guard(env({ items: [{ memo: "ssn 123-45-6789" }] }), null);
    if (decision?.kind !== "REWRITE") throw new Error("expected REWRITE");
    const items = (decision.rewritten.payload as { items: { memo: string }[] }).items;
    expect(items[0]!.memo).toBe("ssn [REDACTED]");
  });

  it("redacts multiple patterns in one field, recording detectedPatterns in declared order", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN, PAN],
      scannedFields: ["note"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    const decision = guard(env({ note: "ssn 123-45-6789 card 4111111111111111" }), null);
    if (decision?.kind !== "REWRITE") throw new Error("expected REWRITE");
    expect((decision.rewritten.payload as { note: string }).note).toBe("ssn [REDACTED] card [REDACTED]");
    expect(decision.basis[0]!.detail).toMatchObject({ detectedPatterns: ["ssn", "pan"] });
  });
});

describe("createDataClassificationGuard — REFUSE", () => {
  it("returns a SECURITY refusal with PII_BLOCKED basis carrying sensitivityLevel", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REFUSE",
      sensitivityLevel: "critical",
      userFacing: "Cannot accept that data.",
    });
    const decision = guard(env({ note: "ssn 123-45-6789" }), null);
    if (decision?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.userFacing).toBe("Cannot accept that data.");
    const b = decision.basis[0]!;
    expect(b.category).toBe("validation");
    expect(b.code).toBe("pii_blocked");
    expect(b.detail).toMatchObject({
      sensitivityLevel: "critical",
      detectedPatterns: ["ssn"],
      fields: ["note"],
    });
  });
});

describe("createDataClassificationGuard — metadata & misconfig", () => {
  it("attaches data_classification GuardDescription", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note", "items.0.memo"],
      action: "REWRITE",
      sensitivityLevel: "high",
    });
    const meta = readGuardMetadata(guard);
    expect(meta?.description).toEqual({
      kind: "data_classification",
      sensitivityLevel: "high",
      action: "REWRITE",
      scannedFields: ["note", "items.0.memo"],
    });
  });

  it("throws when scannedFields is empty (declares no scope)", () => {
    expect(() =>
      createDataClassificationGuard<string, unknown, unknown>({
        matches: () => true,
        patterns: [SSN],
        scannedFields: [],
        action: "REFUSE",
        sensitivityLevel: "low",
      }),
    ).toThrow(/scannedFields must be non-empty/);
  });
});
