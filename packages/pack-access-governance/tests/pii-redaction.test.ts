/**
 * ADR-117: the access pack redacts PII from the free-text `justification` before
 * the request is processed — a published pack actually using
 * createDataClassificationGuard (not just the marketing demo). Taint is
 * preserved; a clean justification is a no-op.
 */
import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Taint } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";

function run(justification: string, taint: Taint = "UNTRUSTED") {
  const env = buildEnvelope({
    kind: "access.request",
    payload: { principal: "a", resourceId: "db.prod", privilegeLevel: 0, justification },
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: `n-${Math.random()}`,
    createdAt: at,
  });
  return adjudicate(env, rehydrateAccessState({ reviews: {}, grants: {} }), accessGovernancePack.policy);
}

describe("access pack — justification PII redaction", () => {
  for (const [label, justification, leak] of [
    ["dashed SSN", "my SSN is 123-45-6789, please grant", "123-45-6789"],
    ["dashless SSN", "ssn 123456789 for audit", "123456789"],
    ["email", "contact me at john.doe@example.com", "john.doe@example.com"],
  ] as const) {
    it(`REWRITE-redacts ${label} (taint preserved)`, () => {
      const d = run(justification);
      expect(d.kind).toBe("REWRITE");
      if (d.kind === "REWRITE") {
        const redacted = (d.rewritten.payload as { justification: string }).justification;
        expect(redacted).not.toContain(leak);
        expect(d.rewritten.taint).toBe("UNTRUSTED"); // never lowered/raised
      }
    });
  }

  it("a clean justification is a no-op (no REWRITE → normal DEFER flow)", () => {
    // No review on file for a non-sensitive resource → deferPendingReview fires.
    expect(run("need prod db access for the Q3 migration").kind).toBe("DEFER");
  });
});
