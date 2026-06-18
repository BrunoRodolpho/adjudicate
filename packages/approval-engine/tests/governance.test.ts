import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { attestationMessage, createEd25519AttestationVerifier, isEscalationDue, quorumMet } from "../src/index.js";

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
