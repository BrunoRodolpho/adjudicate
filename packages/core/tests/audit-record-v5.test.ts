/**
 * AuditRecord v5 (ADR-124): optional `metadata` field, EXCLUDED from the
 * auditHash pre-image so post-hoc/async attachment (hallucination scoring)
 * never invalidates tamper-evidence.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_RECORD_VERSION,
  attachAuditMetadata,
  buildAuditRecord,
  verifyAuditRecord,
} from "../src/audit.js";
import { buildEnvelope } from "../src/envelope.js";
import { decisionExecute } from "../src/decision.js";
import { sha256Canonical } from "../src/hash.js";

function build(metadata?: Record<string, unknown>) {
  const envelope = buildEnvelope({
    kind: "x.do",
    payload: { a: 1 },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope,
    decision: decisionExecute([{ category: "state", code: "transition_valid" }]),
    durationMs: 1,
    at: "2026-04-29T12:00:00.000Z",
    ...(metadata ? { metadata } : {}),
  });
}

describe("AuditRecord v5", () => {
  it("AUDIT_RECORD_VERSION is 5", () => {
    expect(AUDIT_RECORD_VERSION).toBe(5);
  });

  it("carries metadata when supplied", () => {
    const r = build({ hallucination_score: 0.8, hallucination_bucket: "hallucinated" });
    expect(r.metadata).toEqual({ hallucination_score: 0.8, hallucination_bucket: "hallucinated" });
  });

  it("auditHash is IDENTICAL with vs without metadata (the load-bearing case)", () => {
    expect(build().auditHash).toBe(build({ hallucination_score: 0.9 }).auditHash);
  });

  it("a metadata-bearing record still verifies", () => {
    const r = build({ hallucination_score: 0.5 });
    expect(verifyAuditRecord(r).verified).toBe(true);
  });

  it("mutating metadata does NOT flip the record to tampered", () => {
    const r = build({ hallucination_score: 0.1 });
    const mutated = { ...r, metadata: { hallucination_score: 0.99 } };
    expect(verifyAuditRecord(mutated).verified).toBe(true);
  });

  it("mutating a HASHED field is still detected as tampered", () => {
    const r = build({ hallucination_score: 0.1 });
    const tampered = { ...r, durationMs: 9999 };
    expect(verifyAuditRecord(tampered).verified).toBe(false);
  });

  it("attachAuditMetadata merges without changing auditHash/intentHash", () => {
    const r = build({ a: 1 });
    const merged = attachAuditMetadata(r, { b: 2 });
    expect(merged.metadata).toEqual({ a: 1, b: 2 });
    expect(merged.auditHash).toBe(r.auditHash);
    expect(merged.intentHash).toBe(r.intentHash);
    expect(verifyAuditRecord(merged).verified).toBe(true);
  });

  it("a v4-shaped record (no metadata) still verifies", () => {
    const r = build();
    expect(r.metadata).toBeUndefined();
    expect(verifyAuditRecord(r).verified).toBe(true);
  });

  // ── CROSS-VERSION CONTRACT (ADR-124) ──────────────────────────────────────
  // The v5 verifier strips `metadata` from the pre-image; a PRE-v5 verifier does
  // not. So a metadata-bearing v5 record re-hashed by an old verifier derives a
  // different hash → FALSE "tampered". This test pins that hazard as an explicit,
  // documented fact and proves metadata-free records stay cross-version safe.
  it("a pre-v5 verifier FALSELY rejects a metadata-bearing record (→ v5 records require core ≥ v5)", () => {
    const r = build({ hallucination_score: 0.5 });
    // The current (v5) verifier strips metadata → verifies.
    expect(verifyAuditRecord(r).verified).toBe(true);

    // Simulate a pre-v5 verifier: strip ONLY { auditHash, signature } and
    // re-hash the rest — which, on a v5 record, still includes `metadata`.
    const { auditHash: stored, signature: _sig, ...legacyRest } = r;
    expect(sha256Canonical(legacyRest)).not.toBe(stored); // the false-positive

    // Control: a record WITHOUT metadata is cross-version safe — a pre-v5 and a
    // v5 verifier derive the SAME hash, so old verifiers verify it correctly.
    const clean = build();
    const { auditHash: cleanStored, signature: _s2, ...cleanLegacyRest } = clean;
    expect(sha256Canonical(cleanLegacyRest)).toBe(cleanStored);
  });
});
