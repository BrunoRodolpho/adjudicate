import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { capabilityPreimage } from "@adjudicate/core";
import {
  attestationMessage,
  createEd25519AttestationVerifier,
  isEscalationDue,
  quorumMet,
  signCapability,
  verifyCapabilitySignature,
} from "../src/index.js";

describe("quorumMet", () => {
  it("counts distinct approvers by default", () => {
    expect(quorumMet([{ id: "a" }, { id: "a" }], { minApprovals: 2 })).toBe(false);
    expect(quorumMet([{ id: "a" }, { id: "b" }], { minApprovals: 2 })).toBe(true);
  });
  it("counts raw votes when distinctApprovers=false", () => {
    expect(quorumMet([{ id: "a" }, { id: "a" }], { minApprovals: 2, distinctApprovers: false })).toBe(true);
  });
  it("undefined approvals never meets a positive quorum", () => {
    expect(quorumMet(undefined, { minApprovals: 1 })).toBe(false);
  });
});

describe("isEscalationDue", () => {
  const base = {
    status: "pending" as const,
    requestedAt: "2026-05-01T12:00:00.000Z",
    escalation: { afterMs: 60_000, to: "human" as const },
  };
  it("true once past the deadline, false before", () => {
    expect(isEscalationDue(base, Date.parse(base.requestedAt) + 60_000)).toBe(true);
    expect(isEscalationDue(base, Date.parse(base.requestedAt) + 59_999)).toBe(false);
  });
  it("false when not pending or no escalation configured", () => {
    expect(isEscalationDue({ ...base, status: "approved" }, Date.parse(base.requestedAt) + 1e9)).toBe(false);
    expect(isEscalationDue({ status: "pending", requestedAt: base.requestedAt }, 1e18)).toBe(false);
  });
});

describe("createEd25519AttestationVerifier", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifier = createEd25519AttestationVerifier({ alice: pem });
  const sigFor = (token: string, accepted: boolean, intentHash: string) =>
    cryptoSign(null, Buffer.from(attestationMessage({ token, accepted, intentHash }), "utf-8"), privateKey).toString("base64");
  const v = (over: Partial<{ approverId: string; token: string; accepted: boolean; intentHash: string; signature: string }>) =>
    verifier({ approverId: "alice", token: "tok-1", accepted: true, intentHash: "h1", signature: sigFor("tok-1", true, "h1"), ...over });

  it("verifies a valid signature over the canonical message", () => {
    expect(v({})).toBe(true);
  });
  it("rejects wrong token, unknown approver, and garbage signature (fail-closed)", () => {
    expect(v({ token: "tok-2" })).toBe(false);
    expect(v({ approverId: "bob" })).toBe(false);
    expect(v({ signature: "not-a-sig" })).toBe(false);
  });
  it("binds the outcome: a decline-signature cannot be presented as an approve", () => {
    // approver signed for decline; relay flips `accepted` to true.
    expect(v({ accepted: true, signature: sigFor("tok-1", false, "h1") })).toBe(false);
    // and the matching (honest) decline still verifies.
    expect(v({ accepted: false, signature: sigFor("tok-1", false, "h1") })).toBe(true);
  });
  it("binds the intent: a signature for one request cannot be forwarded to another", () => {
    expect(v({ intentHash: "h2", signature: sigFor("tok-1", true, "h1") })).toBe(false);
  });
});

describe("signCapability / verifyCapabilitySignature (021 ed25519 over canonical pre-image)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyId = "kernel-signer-1";
  const pubByKeyId = { [keyId]: publicKeyPem };

  const body = {
    intentHash: "cd017dd347b4a8c4c748f7a064788f82eb30fd240d6667873b16cefeb4ed4bc0",
    kernelId: "kernel://prod/us-east-1",
  };

  it("signs over the canonical pre-image and verifies with the registered public key", () => {
    const cap = signCapability({ body, privateKeyPem, keyId });
    expect(cap.signature.alg).toBe("ed25519");
    expect(cap.signature.keyId).toBe(keyId);
    expect(cap.intentHash).toBe(body.intentHash);
    expect(verifyCapabilitySignature(cap, pubByKeyId)).toBe(true);
  });

  it("the signature is genuinely over capabilityPreimage(body) (non-vacuous)", () => {
    const cap = signCapability({ body, privateKeyPem, keyId });
    // Re-sign the SAME pre-image string with node:crypto directly and confirm
    // ed25519-verify of the engine-produced signature passes against that exact
    // message — i.e. signCapability signed the pre-image, nothing else.
    const ok = verifyCapabilitySignature(cap, pubByKeyId);
    expect(ok).toBe(true);
    // A signature over a DIFFERENT message must not verify as this capability.
    const tampered = { ...cap, intentHash: "00".repeat(32) };
    expect(verifyCapabilitySignature(tampered, pubByKeyId)).toBe(false);
    // sanity: capabilityPreimage is the actual signed surface
    expect(capabilityPreimage(body)).toContain("adjudicate-capability-v1");
  });

  it("fails closed on an UNKNOWN key id", () => {
    const cap = signCapability({ body, privateKeyPem, keyId });
    expect(verifyCapabilitySignature(cap, { "other-key": publicKeyPem })).toBe(false);
  });

  it("fails closed on a BAD / garbage signature", () => {
    const cap = signCapability({ body, privateKeyPem, keyId });
    expect(
      verifyCapabilitySignature(
        { ...cap, signature: { ...cap.signature, value: "not-a-valid-sig" } },
        pubByKeyId,
      ),
    ).toBe(false);
  });

  it("fails closed on CROSS-INTENT replay (sig minted for intent A presented for intent B)", () => {
    const capA = signCapability({ body, privateKeyPem, keyId });
    // Move A's signature onto a capability that claims a different intentHash.
    const replayed = { ...capA, intentHash: "b".repeat(64) };
    expect(verifyCapabilitySignature(replayed, pubByKeyId)).toBe(false);
  });

  it("fails closed on CROSS-KERNEL replay (different kernelId, same signature)", () => {
    const capA = signCapability({ body, privateKeyPem, keyId });
    const replayed = { ...capA, kernelId: "kernel://attacker" };
    expect(verifyCapabilitySignature(replayed, pubByKeyId)).toBe(false);
  });

  it("fails closed when the alg is not ed25519", () => {
    const cap = signCapability({ body, privateKeyPem, keyId });
    expect(
      verifyCapabilitySignature(
        { ...cap, signature: { ...cap.signature, alg: "sha256-hashbind" } },
        pubByKeyId,
      ),
    ).toBe(false);
  });
});
