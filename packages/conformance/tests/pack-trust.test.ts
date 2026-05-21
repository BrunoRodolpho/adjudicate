/**
 * Pack trust primitives — fingerprinting + signature verification.
 *
 * Tests cover:
 *   - Fingerprint determinism (same inputs → same hash, byte-identical)
 *   - Key-order independence (canonical JSON sorts keys)
 *   - intent/signal ordering does not affect the fingerprint
 *   - ed25519 sign + verify roundtrip
 *   - RSA-PSS sign + verify roundtrip
 *   - Tampering the Pack changes the fingerprint
 *   - Cross-algorithm misuse is detected
 *   - verifyPackTrust composite under each policy
 */

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computePackFingerprint,
  signPackFingerprint,
  verifyPackSignature,
  verifyPackTrust,
  type PackFingerprintInput,
  type PackSignature,
} from "../src/pack-trust.js";

const PACK: PackFingerprintInput = {
  id: "pack-test",
  version: "1.2.3",
  contract: "v0",
  intents: ["test.create", "test.cancel"],
  signals: ["test.confirmed"],
  basisCodes: ["test.created", "test.cancelled"],
};

function genEd25519(): { publicKey: string; privateKey: string } {
  const kp = generateKeyPairSync("ed25519");
  return {
    publicKey: kp.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    privateKey: kp.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

function genRSA(): { publicKey: string; privateKey: string } {
  const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKey: kp.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    privateKey: kp.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

describe("computePackFingerprint", () => {
  it("produces a 64-char lowercase hex sha256", () => {
    const fp = computePackFingerprint(PACK);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same input twice → same fingerprint", () => {
    expect(computePackFingerprint(PACK)).toBe(computePackFingerprint(PACK));
  });

  it("is key-order independent (canonical JSON)", () => {
    const fp1 = computePackFingerprint(PACK);
    const fp2 = computePackFingerprint({
      ...PACK,
      // Reorder declaration — should not affect the hash.
      basisCodes: PACK.basisCodes!.slice().reverse(),
      intents: PACK.intents.slice().reverse(),
      signals: PACK.signals!.slice().reverse(),
    });
    expect(fp1).toBe(fp2);
  });

  it("changes when the Pack id changes", () => {
    const fp1 = computePackFingerprint(PACK);
    const fp2 = computePackFingerprint({ ...PACK, id: "pack-test-2" });
    expect(fp1).not.toBe(fp2);
  });

  it("changes when the version changes", () => {
    const fp1 = computePackFingerprint(PACK);
    const fp2 = computePackFingerprint({ ...PACK, version: "1.2.4" });
    expect(fp1).not.toBe(fp2);
  });

  it("changes when intents are added", () => {
    const fp1 = computePackFingerprint(PACK);
    const fp2 = computePackFingerprint({
      ...PACK,
      intents: [...PACK.intents, "test.update"],
    });
    expect(fp1).not.toBe(fp2);
  });

  it("Pack without optional fields fingerprints stably", () => {
    const minimal: PackFingerprintInput = {
      id: "pack-min",
      version: "0.1.0",
      contract: "v0",
      intents: ["min.a"],
    };
    expect(computePackFingerprint(minimal)).toBe(
      computePackFingerprint(minimal),
    );
  });
});

describe("signPackFingerprint + verifyPackSignature (ed25519)", () => {
  it("round-trips a valid signature", () => {
    const { publicKey, privateKey } = genEd25519();
    const fp = computePackFingerprint(PACK);

    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: privateKey,
      algorithm: "ed25519",
      keyId: "test-key-1",
    });
    expect(sig.algorithm).toBe("ed25519");
    expect(sig.keyId).toBe("test-key-1");

    const result = verifyPackSignature({
      fingerprint: fp,
      signature: sig,
      publicKeyPem: publicKey,
    });
    expect(result.verified).toBe(true);
  });

  it("rejects a tampered fingerprint", () => {
    const { publicKey, privateKey } = genEd25519();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: privateKey,
      algorithm: "ed25519",
      keyId: "k1",
    });
    const result = verifyPackSignature({
      fingerprint: fp.replace(/0/g, "1"), // any single-bit mutation breaks
      signature: sig,
      publicKeyPem: publicKey,
    });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects when the wrong public key is used", () => {
    const signer = genEd25519();
    const other = genEd25519();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: signer.privateKey,
      algorithm: "ed25519",
      keyId: "k1",
    });
    const result = verifyPackSignature({
      fingerprint: fp,
      signature: sig,
      publicKeyPem: other.publicKey,
    });
    expect(result.verified).toBe(false);
  });
});

describe("signPackFingerprint + verifyPackSignature (RSA-PSS)", () => {
  it("round-trips a valid signature", () => {
    const { publicKey, privateKey } = genRSA();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: privateKey,
      algorithm: "rsa-pss-sha256",
      keyId: "rsa-k1",
    });
    const result = verifyPackSignature({
      fingerprint: fp,
      signature: sig,
      publicKeyPem: publicKey,
    });
    expect(result.verified).toBe(true);
  });

  it("detects cross-algorithm misuse (ed25519 sig + RSA key)", () => {
    const ed = genEd25519();
    const rsa = genRSA();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: ed.privateKey,
      algorithm: "ed25519",
      keyId: "ed-k",
    });
    const result = verifyPackSignature({
      fingerprint: fp,
      signature: sig,
      publicKeyPem: rsa.publicKey,
    });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toBe("key_algorithm_mismatch");
  });
});

describe("verifyPackTrust", () => {
  it("policy: none — computes fingerprint only, always trusted", () => {
    const report = verifyPackTrust({ pack: PACK, policy: "none" });
    expect(report.trusted).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("policy: best_effort with matching expected fingerprint", () => {
    const fp = computePackFingerprint(PACK);
    const report = verifyPackTrust({
      pack: PACK,
      expectedFingerprint: fp,
      policy: "best_effort",
    });
    expect(report.trusted).toBe(true);
    expect(report.fingerprintMatch).toBe("match");
  });

  it("policy: best_effort with MISMATCHED expected fingerprint", () => {
    const report = verifyPackTrust({
      pack: PACK,
      expectedFingerprint: "0".repeat(64),
      policy: "best_effort",
    });
    expect(report.trusted).toBe(false);
    expect(report.fingerprintMatch).toBe("mismatch");
    expect(report.errors[0]).toMatch(/fingerprint mismatch/);
  });

  it("policy: require_fingerprint without expectedFingerprint fails", () => {
    const report = verifyPackTrust({
      pack: PACK,
      policy: "require_fingerprint",
    });
    expect(report.trusted).toBe(false);
    expect(report.errors[0]).toMatch(/require_fingerprint/);
  });

  it("policy: require_signature with verified signature passes", () => {
    const { publicKey, privateKey } = genEd25519();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: privateKey,
      algorithm: "ed25519",
      keyId: "ops",
    });

    const report = verifyPackTrust({
      pack: PACK,
      publicKeyPem: publicKey,
      signature: sig,
      policy: "require_signature",
    });
    expect(report.trusted).toBe(true);
    expect(report.signatureVerification?.verified).toBe(true);
  });

  it("policy: require_signature without supplied signature fails", () => {
    const report = verifyPackTrust({
      pack: PACK,
      policy: "require_signature",
    });
    expect(report.trusted).toBe(false);
    expect(report.errors[0]).toMatch(/require_signature/);
  });

  it("compound failure: bad fingerprint AND bad signature both surfaced", () => {
    const { publicKey, privateKey } = genEd25519();
    const fp = computePackFingerprint(PACK);
    const sig = signPackFingerprint({
      fingerprint: fp,
      privateKeyPem: privateKey,
      algorithm: "ed25519",
      keyId: "ops",
    });

    // Tamper: change pack but reuse old sig.
    const tampered: PackFingerprintInput = { ...PACK, version: "9.9.9" };
    const report = verifyPackTrust({
      pack: tampered,
      expectedFingerprint: fp,
      publicKeyPem: publicKey,
      signature: sig,
      policy: "best_effort",
    });
    expect(report.trusted).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(2);
  });
});
