/**
 * AuditRecord v4: additive fields (policyVersion, kernelVersion,
 * auditHash, signature) + verifyAuditRecord tamper detection.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_RECORD_VERSION,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  verifyAuditRecord,
} from "../src/index.js";

const ENV = buildEnvelope({
  kind: "test.action",
  payload: { x: 1 },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  nonce: "n-1",
  createdAt: "2026-05-18T00:00:00.000Z",
});

describe("AUDIT_RECORD_VERSION is 4", () => {
  it("constant equals 4", () => {
    expect(AUDIT_RECORD_VERSION).toBe(4);
  });
});

describe("AuditRecord v4 additive fields", () => {
  it("carries policyVersion when supplied", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
      policyVersion: "1.2.3",
    });
    expect(r.policyVersion).toBe("1.2.3");
  });

  it("carries kernelVersion when supplied", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
      kernelVersion: "0.4.0",
    });
    expect(r.kernelVersion).toBe("0.4.0");
  });

  it("carries auditHash on every v4 record", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    expect(r.auditHash).toBeDefined();
    expect(r.auditHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("auditHash is deterministic (same input → same hash)", () => {
    const r1 = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    const r2 = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    expect(r1.auditHash).toBe(r2.auditHash);
  });

  it("auditHash differs for different decisions", () => {
    const rExec = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    const rRefuse = buildAuditRecord({
      envelope: ENV,
      decision: decisionRefuse(refuse("SECURITY", "x", "y"), []),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    expect(rExec.auditHash).not.toBe(rRefuse.auditHash);
  });
});

describe("verifyAuditRecord", () => {
  it("returns verified=true for an untampered v4 record", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    const v = verifyAuditRecord(r);
    expect(v.verified).toBe(true);
  });

  it("returns verified=false on tamper (mutated decision)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Tamper: swap the decision in-place
    const tampered = {
      ...r,
      decision: decisionRefuse(refuse("SECURITY", "x", "y"), []),
    };
    const v = verifyAuditRecord(tampered);
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("tampered");
      expect(v.stored).toBe(r.auditHash);
    }
  });

  it("returns verified=null for v3-shaped record (no auditHash)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    const v3Shape = { ...r };
    delete (v3Shape as { auditHash?: string }).auditHash;
    const v = verifyAuditRecord(v3Shape as typeof r);
    expect(v.verified).toBeNull();
  });

  // SecurityReviewer-008: verifyAuditRecord now compares derived-vs-stored with
  // a constant-time hex compare (timingSafeHexEqual) instead of `!==`. These pin
  // the two branches that compare-hardening must handle: a same-length wrong
  // hash (the constant-time path) and a length-mismatch hash (the guard path,
  // which must NOT throw — timingSafeEqual would throw on unequal lengths).
  it("returns verified=false for a same-length wrong auditHash (constant-time branch)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Overwrite auditHash with a different 64-hex string of the SAME length so
    // the derived (correct) hash and the stored hash differ only in content.
    const wrong = { ...r, auditHash: "a".repeat(64) };
    const v = verifyAuditRecord(wrong);
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("tampered");
      expect(v.stored).toBe("a".repeat(64));
    }
  });

  it("returns verified=false (never throws) for a length-mismatched auditHash", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Truncated stored hash — unequal length must resolve to "tampered", not a
    // thrown RangeError from timingSafeEqual.
    const shortHash = { ...r, auditHash: "dead" };
    let v: ReturnType<typeof verifyAuditRecord>;
    expect(() => {
      v = verifyAuditRecord(shortHash);
    }).not.toThrow();
    expect(v!.verified).toBe(false);
    if (v!.verified === false) {
      expect(v!.reason).toBe("tampered");
      expect(v!.stored).toBe("dead");
    }
  });

  it("signature field round-trips without affecting hash", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    const signed = {
      ...r,
      signature: { keyId: "test-key", alg: "ES256", value: "sig" },
    };
    const v = verifyAuditRecord(signed);
    // Hash is over record \ { auditHash, signature }, so adding the
    // signature does not invalidate the hash.
    expect(v.verified).toBe(true);
  });
});

// CryptoReviewer-006 / LogicReviewer-012: verifyAuditRecord now also re-derives
// envelope.intentHash from the envelope's content-addressed fields and refuses
// a record whose stored intentHash doesn't match its own content — independent
// of the v4 auditHash. Catches a record built with a forged/drifted envelope
// hash even when the surrounding auditHash is itself valid.
describe("verifyAuditRecord envelope self-consistency", () => {
  it("returns verified=false / envelope_intent_mismatch for a forged envelope.intentHash", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Overwrite the envelope's intentHash with a same-length wrong value; the
    // surrounding record is otherwise untouched (auditHash still over this
    // record, so the auditHash branch would NOT fire — the envelope check must).
    const forged = {
      ...r,
      envelope: { ...r.envelope, intentHash: "b".repeat(64) },
    };
    const v = verifyAuditRecord(forged);
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("envelope_intent_mismatch");
      expect(v.stored).toBe("b".repeat(64));
      expect(v.derived).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("catches a corrupted envelope payload (stored intentHash now stale)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Mutate payload but keep the original intentHash — now self-inconsistent.
    const corrupted = {
      ...r,
      envelope: { ...r.envelope, payload: { x: 999 } },
    };
    const v = verifyAuditRecord(corrupted);
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("envelope_intent_mismatch");
    }
  });

  it("does not false-positive on a consistent record (still verified=true)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    expect(verifyAuditRecord(r).verified).toBe(true);
  });

  it("runs before the missing_hash check (pre-v4 record with forged envelope is flagged, not skipped)", () => {
    const r = buildAuditRecord({
      envelope: ENV,
      decision: decisionExecute([]),
      durationMs: 5,
      at: "2026-05-18T00:00:01.000Z",
    });
    // Strip auditHash (pre-v4 shape) AND forge the envelope hash.
    const preV4Forged = {
      ...r,
      envelope: { ...r.envelope, intentHash: "c".repeat(64) },
    };
    delete (preV4Forged as { auditHash?: string }).auditHash;
    const v = verifyAuditRecord(preV4Forged as typeof r);
    // The envelope check fires first → envelope_intent_mismatch, NOT missing_hash.
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("envelope_intent_mismatch");
    }
  });
});
