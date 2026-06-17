import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import type { AuditRecord, Taint } from "@adjudicate/core";
import {
  createDataClassificationGuard,
  createDataClassificationShadowProvider,
  type DataClassificationPattern,
} from "../src/index.js";

const at = "2026-04-29T12:00:00.000Z";
const SSN: DataClassificationPattern = { id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ };

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

describe("createDataClassificationGuard — maxInputLength + ReDoS guard", () => {
  it("skips scanning fields longer than maxInputLength (fail-open on size)", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      matches: () => true,
      patterns: [SSN],
      scannedFields: ["note"],
      action: "REFUSE",
      sensitivityLevel: "high",
      maxInputLength: 16,
    });
    // 19-char field containing an SSN → exceeds cap → skipped, no opinion.
    expect(guard(env({ note: "padding 123-45-6789" }), null)).toBeNull();
    // short field (11 chars) still scanned → REFUSE.
    expect(guard(env({ note: "123-45-6789" }), null)?.kind).toBe("REFUSE");
  });

  it("rejects an unsafe (ReDoS) pattern at construction", () => {
    expect(() =>
      createDataClassificationGuard<string, unknown, unknown>({
        matches: () => true,
        patterns: [{ id: "evil", pattern: /(a+)+$/ }],
        scannedFields: ["note"],
        action: "REFUSE",
        sensitivityLevel: "high",
      }),
    ).toThrow(/nested unbounded quantifier/);
  });
});

describe("createDataClassificationShadowProvider — out-of-path observe-only (§4.6)", () => {
  function recordFor(payload: unknown): AuditRecord {
    // The provider only reads record.envelope.payload; a partial record suffices.
    return { envelope: env(payload) } as unknown as AuditRecord;
  }

  it("attaches detection metadata WITHOUT producing a Decision", () => {
    const { metadataProvider } = createDataClassificationShadowProvider({
      patterns: [SSN],
      scannedFields: ["note"],
      sensitivityLevel: "high",
    });
    const meta = metadataProvider(recordFor({ note: "ssn 123-45-6789" }));
    expect(meta).toEqual({
      pii_shadow_detected: ["ssn"],
      pii_shadow_fields: ["note"],
      pii_shadow_sensitivity: "high",
    });
  });

  it("returns undefined on a clean record (preserves byte-identical audit hash)", () => {
    const { metadataProvider } = createDataClassificationShadowProvider({
      patterns: [SSN],
      scannedFields: ["note"],
      sensitivityLevel: "high",
    });
    expect(metadataProvider(recordFor({ note: "nothing here" }))).toBeUndefined();
    expect(metadataProvider(recordFor({ other: "123-45-6789" }))).toBeUndefined();
  });

  it("honors maxInputLength and the matches() predicate", () => {
    const { metadataProvider } = createDataClassificationShadowProvider({
      patterns: [SSN],
      scannedFields: ["note"],
      sensitivityLevel: "high",
      maxInputLength: 5,
      matches: (r) => r.envelope.kind === "test.submit",
    });
    expect(metadataProvider(recordFor({ note: "123-45-6789" }))).toBeUndefined(); // too long → skipped
  });

  it("rejects unsafe patterns and empty scannedFields at construction", () => {
    expect(() =>
      createDataClassificationShadowProvider({
        patterns: [{ id: "evil", pattern: /(a*)*/ }],
        scannedFields: ["note"],
        sensitivityLevel: "high",
      }),
    ).toThrow(/nested unbounded quantifier/);
    expect(() =>
      createDataClassificationShadowProvider({
        patterns: [SSN],
        scannedFields: [],
        sensitivityLevel: "high",
      }),
    ).toThrow(/non-empty/);
  });
});
