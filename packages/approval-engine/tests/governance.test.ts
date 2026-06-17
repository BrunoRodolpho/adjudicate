import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createEd25519AttestationVerifier, isEscalationDue, quorumMet } from "../src/index.js";

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
  const sigFor = (token: string) => cryptoSign(null, Buffer.from(token, "utf-8"), privateKey).toString("base64");

  it("verifies a valid signature over the token", () => {
    expect(verifier({ approverId: "alice", token: "tok-1", signature: sigFor("tok-1") })).toBe(true);
  });
  it("rejects wrong token, unknown approver, and garbage signature (fail-closed)", () => {
    expect(verifier({ approverId: "alice", token: "tok-2", signature: sigFor("tok-1") })).toBe(false);
    expect(verifier({ approverId: "bob", token: "tok-1", signature: sigFor("tok-1") })).toBe(false);
    expect(verifier({ approverId: "alice", token: "tok-1", signature: "not-a-sig" })).toBe(false);
  });
});
