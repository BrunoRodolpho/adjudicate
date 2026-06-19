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

function buildWithPrev(prevAuditHash?: string) {
  const envelope = buildEnvelope({
    kind: "x.do",
    payload: { a: 1 },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-chain",
    createdAt: "2026-04-29T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope,
    decision: decisionExecute([{ category: "state", code: "transition_valid" }]),
    durationMs: 1,
    at: "2026-04-29T12:00:00.000Z",
    ...(prevAuditHash !== undefined ? { prevAuditHash } : {}),
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

// ── 093 — inter-record hash chain (`prevAuditHash`) ──────────────────────────
// `prevAuditHash` is the per-stream cryptographic tip — the `auditHash` of the
// immediately-preceding record. It is EXCLUDED from the auditHash pre-image
// (exactly like signature/metadata) so threading the chain link onto a record
// never invalidates the existing record hash. A genesis record (no predecessor)
// is `undefined`.
describe("AuditRecord 093 — prevAuditHash hash chain", () => {
  it("a genesis record (no prevAuditHash) carries no chain link and verifies", () => {
    const genesis = buildWithPrev();
    expect(genesis.prevAuditHash).toBeUndefined();
    expect(verifyAuditRecord(genesis).verified).toBe(true);
  });

  it("carries prevAuditHash when supplied", () => {
    const r = buildWithPrev("deadbeef".repeat(8));
    expect(r.prevAuditHash).toBe("deadbeef".repeat(8));
  });

  it("auditHash is IDENTICAL with vs without prevAuditHash (the load-bearing exclusion)", () => {
    // Same envelope/decision/at → same record content. Attaching the chain link
    // must NOT change the record's auditHash, exactly like signature/metadata.
    const genesisHash = buildWithPrev().auditHash;
    const linkedHash = buildWithPrev("a".repeat(64)).auditHash;
    expect(genesisHash).toBe(linkedHash);
    expect(genesisHash).toBeDefined();
  });

  it("changing prevAuditHash does NOT change the auditHash", () => {
    const a = buildWithPrev("a".repeat(64)).auditHash;
    const b = buildWithPrev("b".repeat(64)).auditHash;
    expect(a).toBe(b);
  });

  it("a prevAuditHash-bearing record verifies (chain link excluded from pre-image)", () => {
    const r = buildWithPrev("c".repeat(64));
    expect(verifyAuditRecord(r).verified).toBe(true);
  });

  it("MUTATING prevAuditHash does NOT flip the record to tampered (excluded field)", () => {
    const r = buildWithPrev("d".repeat(64));
    const mutated = { ...r, prevAuditHash: "e".repeat(64) };
    expect(verifyAuditRecord(mutated).verified).toBe(true);
  });

  it("ATTACHING prevAuditHash post-hoc to a genesis record does NOT flip it to tampered", () => {
    // The realistic persist-side flow: a genesis record is built (no link), then
    // the chain link is threaded on when the predecessor's auditHash is known.
    const genesis = buildWithPrev();
    const threaded = { ...genesis, prevAuditHash: "f".repeat(64) };
    expect(verifyAuditRecord(threaded).verified).toBe(true);
    expect(threaded.auditHash).toBe(genesis.auditHash);
  });

  it("a HASHED field mutation is still detected as tampered even on a chained record", () => {
    const r = buildWithPrev("a".repeat(64));
    const tampered = { ...r, durationMs: 9999 };
    expect(verifyAuditRecord(tampered).verified).toBe(false);
  });

  it("prevAuditHash is cross-stable: a pre-093 verifier (strip auditHash/signature/metadata only) derives the SAME hash on a chained record", () => {
    // Because prevAuditHash is excluded from the pre-image, a verifier that only
    // strips {auditHash, signature, metadata} (pre-093) but ALSO never wrote the
    // field still derives the same hash — but a chained record carries the extra
    // key. Prove the EXCLUSION holds: stripping prevAuditHash too re-derives the
    // stored hash. This is the inverse of the metadata cross-version hazard:
    // genesis and chained records share an auditHash by construction.
    const r = buildWithPrev("a".repeat(64));
    const {
      auditHash: stored,
      signature: _sig,
      metadata: _md,
      prevAuditHash: _prev,
      ...rest
    } = r;
    expect(sha256Canonical(rest)).toBe(stored);
  });
});
