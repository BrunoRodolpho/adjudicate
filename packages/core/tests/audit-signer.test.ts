/**
 * 092 — AuditSigner + verify-on-read signature outcome.
 *
 * Pins:
 *   1. `buildAuditRecord` + an injected signer produces a `signature` whose
 *      PRESENCE does NOT change `auditHash` (pre-image-exclusion invariant §7).
 *   2. `verifyAuditRecord` returns `verified:true` for a valid hash-bind
 *      signature, the new `invalid_signature` outcome for a forged one, and
 *      preserves `tampered` / `envelope_intent_mismatch` / `missing_hash`.
 *   3. A throwing signer FAILS CLOSED (propagates out of `buildAuditRecord`),
 *      so no unsigned record is ever produced when a signer was configured.
 *   4. The injected asymmetric `verifySignature` hook flags a forged ed25519
 *      signature, and an unverified asymmetric signature stays fail-SAFE.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_HASHBIND_ALG,
  auditSignaturePreimage,
  bindAuditSignature,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  hashBindAuditSigner,
  sha256Canonical,
  verifyAuditRecord,
  type AuditSigner,
} from "../src/index.js";

const ENV = buildEnvelope({
  kind: "test.action",
  payload: { x: 1 },
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  nonce: "n-1",
  createdAt: "2026-05-18T00:00:00.000Z",
});

const baseInput = {
  envelope: ENV,
  decision: decisionExecute([]),
  durationMs: 5,
  at: "2026-05-18T00:00:01.000Z",
} as const;

describe("092 — signature presence does not change auditHash (pre-image exclusion)", () => {
  it("a signed record and an unsigned record have the SAME auditHash", () => {
    const unsigned = buildAuditRecord({ ...baseInput });
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    expect(signed.signature).toBeDefined();
    expect(unsigned.signature).toBeUndefined();
    // The whole point: signing AFTER the hash, excluded from the pre-image.
    expect(signed.auditHash).toBe(unsigned.auditHash);
  });

  it("signing leaves the verify path verified:true", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    expect(verifyAuditRecord(signed).verified).toBe(true);
  });

  it("the attached signature uses the hash-bind alg and records the keyId", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    expect(signed.signature!.alg).toBe(AUDIT_HASHBIND_ALG);
    expect(signed.signature!.keyId).toBe("kms://test-key");
    // value commits to the pre-image over (auditHash, keyId).
    expect(signed.signature!.value).toBe(
      sha256Canonical(
        auditSignaturePreimage(signed.auditHash!, "kms://test-key"),
      ),
    );
  });
});

describe("092 — verifyAuditRecord distinguishes a forged signature from a valid one", () => {
  it("verified:true for a valid hash-bind signature", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    expect(verifyAuditRecord(signed).verified).toBe(true);
  });

  it("invalid_signature for a forged hash-bind value (auditHash intact)", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    // Forge ONLY the signature value (same length); auditHash untouched, so the
    // tamper axis passes and the signature axis must fail.
    const forged = {
      ...signed,
      signature: { ...signed.signature!, value: "a".repeat(64) },
    };
    const v = verifyAuditRecord(forged);
    expect(v.verified).toBe(false);
    if (v.verified === false && v.reason === "invalid_signature") {
      expect(v.keyId).toBe("kms://test-key");
      expect(v.alg).toBe(AUDIT_HASHBIND_ALG);
    } else {
      throw new Error(`expected invalid_signature, got ${JSON.stringify(v)}`);
    }
  });

  it("invalid_signature when a valid signature is MOVED to another record", () => {
    const recordA = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    const recordB = buildAuditRecord({
      ...baseInput,
      durationMs: 99, // different auditHash
      signer: hashBindAuditSigner("kms://test-key"),
    });
    // Lift A's signature onto B. B's auditHash differs, so the signature's
    // pre-image (bound to B's auditHash) no longer matches A's value.
    const moved = { ...recordB, signature: recordA.signature };
    const v = verifyAuditRecord(moved);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("invalid_signature");
  });

  it("tampered still wins over the signature axis (auditHash mismatch reported first)", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    // Tamper a hashed field — the auditHash axis fails BEFORE the signature axis.
    const tampered = { ...signed, durationMs: 9999 };
    const v = verifyAuditRecord(tampered);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("tampered");
  });

  it("preserves envelope_intent_mismatch (forged envelope hash) over the signature axis", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    const forgedEnv = {
      ...signed,
      envelope: { ...signed.envelope, intentHash: "b".repeat(64) },
    };
    const v = verifyAuditRecord(forgedEnv);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("envelope_intent_mismatch");
  });

  it("preserves missing_hash for a pre-v4 record carrying a signature", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    const preV4 = { ...signed };
    delete (preV4 as { auditHash?: string }).auditHash;
    const v = verifyAuditRecord(preV4 as typeof signed);
    expect(v.verified).toBeNull();
    if (v.verified === null) expect(v.reason).toBe("missing_hash");
  });

  it("an UNSIGNED record still verifies (OSS tamper-evident-only contract)", () => {
    const unsigned = buildAuditRecord({ ...baseInput });
    expect(unsigned.signature).toBeUndefined();
    expect(verifyAuditRecord(unsigned).verified).toBe(true);
  });
});

describe("092 — signer fail-closed", () => {
  it("a throwing signer propagates out of buildAuditRecord (no unsigned record)", () => {
    const throwingSigner: AuditSigner = {
      keyId: "kms://broken",
      sign() {
        throw new Error("KMS unavailable");
      },
    };
    expect(() =>
      buildAuditRecord({ ...baseInput, signer: throwingSigner }),
    ).toThrow("KMS unavailable");
  });
});

describe("092 — asymmetric verifier hook (node-side, injected)", () => {
  const asymmetricSigned = () => {
    const r = buildAuditRecord({ ...baseInput });
    return {
      ...r,
      signature: { keyId: "kms://ed", alg: "ed25519", value: "ZmFrZXNpZw==" },
    };
  };

  it("without a verifier, an asymmetric signature is fail-SAFE (verified:true on hash axis)", () => {
    // core cannot verify ed25519 (no node:crypto / public key) — it must NOT
    // false-fail a record whose asymmetric signature it structurally can't check.
    expect(verifyAuditRecord(asymmetricSigned()).verified).toBe(true);
  });

  it("an injected verifier that REJECTS flags invalid_signature", () => {
    const v = verifyAuditRecord(asymmetricSigned(), {
      verifySignature: () => false,
    });
    expect(v.verified).toBe(false);
    if (v.verified === false) {
      expect(v.reason).toBe("invalid_signature");
      if (v.reason === "invalid_signature") expect(v.alg).toBe("ed25519");
    }
  });

  it("an injected verifier that ACCEPTS keeps verified:true and is bound to auditHash", () => {
    const record = asymmetricSigned();
    let boundHash = "";
    const v = verifyAuditRecord(record, {
      verifySignature: (auditHash) => {
        boundHash = auditHash;
        return true;
      },
    });
    expect(v.verified).toBe(true);
    // The verifier is handed the record's stored auditHash so a signature can't
    // be moved to a different record without detection.
    expect(boundHash).toBe(record.auditHash);
  });

  it("the hash-bind leg is verified even when a verifySignature hook is present", () => {
    const signed = buildAuditRecord({
      ...baseInput,
      signer: hashBindAuditSigner("kms://test-key"),
    });
    const forged = {
      ...signed,
      signature: { ...signed.signature!, value: "c".repeat(64) },
    };
    // verifySignature should NOT be consulted for a hash-bind alg — the pure-JS
    // leg flags it regardless.
    let asymmetricCalled = false;
    const v = verifyAuditRecord(forged, {
      verifySignature: () => {
        asymmetricCalled = true;
        return true;
      },
    });
    expect(asymmetricCalled).toBe(false);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("invalid_signature");
  });
});

describe("092 — bindAuditSignature / auditSignaturePreimage helpers", () => {
  it("bindAuditSignature value verifies against the same record", () => {
    const r = buildAuditRecord({ ...baseInput });
    const sig = bindAuditSignature(r.auditHash!, "kms://k1");
    const signed = { ...r, signature: sig };
    expect(verifyAuditRecord(signed).verified).toBe(true);
  });

  it("binding the keyId: a value minted under one keyId fails under another", () => {
    const r = buildAuditRecord({ ...baseInput });
    const sig = bindAuditSignature(r.auditHash!, "kms://k1");
    // Present the same value but claim a different keyId — pre-image differs.
    const swapped = { ...r, signature: { ...sig, keyId: "kms://k2" } };
    const v = verifyAuditRecord(swapped);
    expect(v.verified).toBe(false);
    if (v.verified === false) expect(v.reason).toBe("invalid_signature");
  });
});
