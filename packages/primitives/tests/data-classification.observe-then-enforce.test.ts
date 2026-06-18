import { describe, expect, it } from "vitest";
import { buildEnvelope, BASIS_CODES } from "@adjudicate/core";
import type { AuditRecord, Taint } from "@adjudicate/core";
import {
  createDataClassificationGuard,
  createDataClassificationShadowProvider,
  type DataClassificationPattern,
} from "../src/index.js";

/**
 * WS-C worked example — observe-then-enforce PII rollout (ADR-141 §4.6).
 *
 * The SAME classification config is reused verbatim: first as the out-of-path
 * SHADOW provider (observe — records detection in hash-excluded metadata,
 * never produces a Decision), then as an in-path enforcing guard (REWRITE or
 * REFUSE). The enforce path emits `validation.pii_redacted` / `pii_blocked` —
 * the exact basis codes the admin-sdk PII handlers already project to the
 * `redacted` / `blocked` dispositions — so promoting to enforce needs NO
 * schema or UI change. See docs/guides/pii-observe-then-enforce.md.
 */

const at = "2026-06-17T12:00:00.000Z";
const SSN: DataClassificationPattern = { id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ };

// One config, shared by both modes — this IS the observe→enforce flip surface.
const classification = {
  patterns: [SSN],
  scannedFields: ["note"],
  sensitivityLevel: "high",
} as const;

function env<P>(payload: P, taint: Taint = "UNTRUSTED", nonce = "n-1") {
  return buildEnvelope({
    kind: "support.ticket.create",
    payload,
    actor: { principal: "llm", sessionId: "sess" },
    taint,
    nonce,
    createdAt: at,
  });
}

function recordFor(payload: unknown): AuditRecord {
  // The shadow provider only reads record.envelope.payload; a partial suffices.
  return { envelope: env(payload) } as unknown as AuditRecord;
}

describe("PII observe → enforce promotion (WS-C / ADR-141 §4.6)", () => {
  const dirty = { note: "call me at ssn 123-45-6789" };

  it("OBSERVE: shadow provider records detection in hash-excluded metadata, no Decision", () => {
    const { metadataProvider } = createDataClassificationShadowProvider(classification);
    // Out-of-path: detection surfaces only in metadata; the guard chain is untouched.
    expect(metadataProvider(recordFor(dirty))).toEqual({
      pii_shadow_detected: ["ssn"],
      pii_shadow_fields: ["note"],
      pii_shadow_sensitivity: "high",
    });
  });

  it("ENFORCE (REWRITE): same config emits validation.pii_redacted, masks the field, preserves taint", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      ...classification,
      matches: () => true,
      action: "REWRITE",
    });
    const decision = guard(env(dirty), null);
    expect(decision?.kind).toBe("REWRITE");
    if (decision?.kind !== "REWRITE") throw new Error("expected REWRITE");

    // Emits the basis code the admin-sdk PII handler already projects to "redacted".
    expect(decision.basis[0]).toMatchObject({
      category: "validation",
      code: BASIS_CODES.validation.PII_REDACTED, // "pii_redacted"
    });
    // The matched value is masked in the rewritten payload...
    expect((decision.rewritten.payload as { note: string }).note).not.toContain("123-45-6789");
    // ...but taint is preserved verbatim — redaction removes content, it does NOT declassify.
    expect(decision.rewritten.taint).toBe("UNTRUSTED");
  });

  it("ENFORCE (REFUSE): same config emits validation.pii_blocked", () => {
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      ...classification,
      matches: () => true,
      action: "REFUSE",
    });
    const decision = guard(env(dirty), null);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(decision.basis[0]).toMatchObject({
      category: "validation",
      code: BASIS_CODES.validation.PII_BLOCKED, // "pii_blocked"
    });
  });

  it("contract: enforce basis codes are exactly the strings the admin-sdk PII handlers key on", () => {
    // admin-sdk handlers/pii-events.ts + pii-classification.ts map:
    //   pii_redacted → "redacted", pii_blocked → "blocked"
    // These codes are already projected, so enforce needs no schema/UI change.
    expect(BASIS_CODES.validation.PII_REDACTED).toBe("pii_redacted");
    expect(BASIS_CODES.validation.PII_BLOCKED).toBe("pii_blocked");
  });

  it("a clean payload yields no opinion in BOTH modes (chain proceeds untouched)", () => {
    const clean = { note: "no sensitive data here" };
    const { metadataProvider } = createDataClassificationShadowProvider(classification);
    expect(metadataProvider(recordFor(clean))).toBeUndefined();
    const guard = createDataClassificationGuard<string, unknown, unknown>({
      ...classification,
      matches: () => true,
      action: "REWRITE",
    });
    expect(guard(env(clean), null)).toBeNull();
  });
});
