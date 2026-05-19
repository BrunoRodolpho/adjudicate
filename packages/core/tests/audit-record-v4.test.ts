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
