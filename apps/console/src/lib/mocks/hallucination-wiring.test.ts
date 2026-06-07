import { describe, expect, it } from "vitest";
import { verifyAuditRecord } from "@adjudicate/core";
import { ALL_MOCKS } from "./index";

/**
 * Item 8 wiring proof: the reference data carries v5 hallucination metadata via
 * the shipped reference scorer, so the HallucinationBadge actually renders (the
 * audit's complaint was that it always rendered null). Attaching metadata must
 * NOT break tamper-evidence (it is excluded from the auditHash pre-image).
 */
describe("ALL_MOCKS hallucination wiring", () => {
  const scored = ALL_MOCKS.filter(
    (r) => typeof (r as { metadata?: Record<string, unknown> }).metadata?.hallucination_score === "number",
  );

  it("seeds at least one grounded and one hallucinated record", () => {
    const buckets = scored.map(
      (r) => (r as { metadata?: Record<string, unknown> }).metadata!.hallucination_bucket,
    );
    expect(buckets).toContain("grounded");
    expect(buckets).toContain("hallucinated");
  });

  it("attaching metadata leaves the audit hash verifiable (excluded from pre-image)", () => {
    for (const r of scored) expect(verifyAuditRecord(r).verified).toBe(true);
  });
});
