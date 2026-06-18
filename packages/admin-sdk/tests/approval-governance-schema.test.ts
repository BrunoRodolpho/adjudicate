import { describe, expect, it } from "vitest";
import {
  ApprovalRequestSchema,
  ApprovalResolveInputSchema,
  AttestationSchema,
} from "../src/schemas/approval.js";

/**
 * WS-B — the admin-sdk approval schema is the single source the console +
 * adjutant read. These pin the new ADR-143 governance fields (approvals[] /
 * escalation / quorum) and the attestation resolve input. Contract guard: the
 * shapes MIRROR @adjudicate/approval-engine (registry.ts / governance.ts);
 * admin-sdk must not runtime-depend on the engine, so a representative
 * engine-shaped object is parsed here to catch drift.
 */

const baseRequest = {
  token: "t1",
  sessionId: "s1",
  intentHash: "0xabc",
  intentKind: "payments.pix.send",
  prompt: "Approve?",
  taint: "UNTRUSTED",
  channel: "console",
  status: "pending",
  requestedAt: "2026-06-17T00:00:00.000Z",
} as const;

describe("ApprovalRequestSchema — ADR-143 governance fields", () => {
  it("parses an engine-shaped request with approvals[] / escalation / quorum", () => {
    const parsed = ApprovalRequestSchema.parse({
      ...baseRequest,
      approvals: [
        { id: "alice", at: "2026-06-17T00:01:00.000Z", displayName: "Alice" },
        { id: "bob", at: "2026-06-17T00:02:00.000Z" },
      ],
      escalation: { afterMs: 3_600_000, to: "supervisor" },
      quorum: { minApprovals: 2, distinctApprovers: true },
    });
    expect(parsed.approvals).toHaveLength(2);
    expect(parsed.escalation).toEqual({ afterMs: 3_600_000, to: "supervisor" });
    expect(parsed.quorum).toEqual({ minApprovals: 2, distinctApprovers: true });
  });

  it("leaves the governance fields undefined when absent (optional, non-breaking)", () => {
    const parsed = ApprovalRequestSchema.parse(baseRequest);
    expect(parsed.approvals).toBeUndefined();
    expect(parsed.escalation).toBeUndefined();
    expect(parsed.quorum).toBeUndefined();
  });

  it("rejects an invalid escalation target and a non-positive quorum", () => {
    expect(() =>
      ApprovalRequestSchema.parse({ ...baseRequest, escalation: { afterMs: 1, to: "nobody" } }),
    ).toThrow();
    expect(() =>
      ApprovalRequestSchema.parse({ ...baseRequest, quorum: { minApprovals: 0 } }),
    ).toThrow();
  });
});

describe("ApprovalResolveInputSchema — attestation", () => {
  it("accepts an optional attestation (engine-shaped)", () => {
    const parsed = ApprovalResolveInputSchema.parse({
      token: "t1",
      accepted: true,
      attestation: { approverId: "alice", signature: "YmFzZTY0c2ln" },
    });
    expect(parsed.attestation).toEqual({ approverId: "alice", signature: "YmFzZTY0c2ln" });
  });

  it("remains valid without an attestation (back-compat)", () => {
    const parsed = ApprovalResolveInputSchema.parse({ token: "t1", accepted: false });
    expect(parsed.attestation).toBeUndefined();
  });

  it("AttestationSchema requires both approverId and signature", () => {
    expect(() => AttestationSchema.parse({ approverId: "alice" })).toThrow();
    expect(() => AttestationSchema.parse({ signature: "x" })).toThrow();
  });
});
