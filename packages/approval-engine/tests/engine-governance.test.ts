import { describe, expect, it } from "vitest";
import {
  createApprovalEngine,
  createConsoleLogChannel,
  createInMemoryApprovalRegistry,
  type ApprovalEngineOptions,
} from "../src/index.js";
import { baseRequest, fakeAgent } from "./helpers.js";

function makeEngine(extra: Partial<ApprovalEngineOptions<unknown, unknown, string[]>> = {}) {
  const { agent, confirmCalls } = fakeAgent();
  const registry = createInMemoryApprovalRegistry({
    nowMs: () => 1_700_000_000_000,
    nowIso: () => "2026-05-01T12:00:00.000Z",
  });
  const engine = createApprovalEngine<unknown, unknown, string[]>({
    agent,
    registry,
    channels: [createConsoleLogChannel()],
    resolveStateContext: async () => ({ state: {}, context: {} }),
    now: () => "2026-05-01T12:00:00.000Z",
    ...extra,
  });
  return { engine, confirmCalls };
}

describe("approval engine — quorum (ADR-143)", () => {
  it("accumulates approvals; confirm() runs only once quorum is reached", async () => {
    const { engine, confirmCalls } = makeEngine({ quorum: { minApprovals: 2 } });
    await engine.request(baseRequest);

    const r1 = await engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } });
    expect(r1.turn).toBeNull();
    expect(r1.request.status).toBe("pending");
    expect(confirmCalls.length).toBe(0);

    const r2 = await engine.resolve({ token: "tok-1", accepted: true, by: { id: "b" } });
    expect(r2.turn).not.toBeNull();
    expect(r2.request.status).toBe("approved");
    expect(r2.request.approvals?.map((a) => a.id)).toEqual(["a", "b"]);
    expect(confirmCalls.length).toBe(1);
  });

  it("distinct approvers: a repeat vote does not advance quorum", async () => {
    const { engine, confirmCalls } = makeEngine({ quorum: { minApprovals: 2 } });
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } });
    const dup = await engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } });
    expect(dup.turn).toBeNull();
    expect(confirmCalls.length).toBe(0);
  });

  it("a single decline resolves immediately even under quorum", async () => {
    const { engine, confirmCalls } = makeEngine({ quorum: { minApprovals: 3 } });
    await engine.request(baseRequest);
    const r = await engine.resolve({ token: "tok-1", accepted: false, by: { id: "a" } });
    expect(r.request.status).toBe("declined");
    expect(confirmCalls.length).toBe(1);
  });
});

describe("approval engine — attestation (ADR-143)", () => {
  const verifier = (input: { approverId: string; signature: string }) =>
    input.approverId === "alice" && input.signature === "good";

  it("rejects resolve without a valid attestation (forged/missing)", async () => {
    const { engine, confirmCalls } = makeEngine({ attestationVerifier: verifier });
    await engine.request(baseRequest);
    await expect(engine.resolve({ token: "tok-1", accepted: true })).rejects.toThrow(/attestation/i);
    await expect(
      engine.resolve({ token: "tok-1", accepted: true, attestation: { approverId: "alice", signature: "bad" } }),
    ).rejects.toThrow(/attestation/i);
    expect(confirmCalls.length).toBe(0);
  });

  it("accepts a valid attestation and records the verified approver", async () => {
    const { engine, confirmCalls } = makeEngine({ attestationVerifier: verifier });
    await engine.request(baseRequest);
    const r = await engine.resolve({ token: "tok-1", accepted: true, attestation: { approverId: "alice", signature: "good" } });
    expect(r.request.status).toBe("approved");
    expect(r.request.resolvedBy?.id).toBe("alice");
    expect(confirmCalls.length).toBe(1);
  });
});

describe("approval engine — escalation", () => {
  it("stores the escalation policy on the request for an out-of-band scheduler", async () => {
    const { engine } = makeEngine();
    const req = await engine.request({ ...baseRequest, escalation: { afterMs: 60_000, to: "supervisor" } });
    expect(req.escalation).toEqual({ afterMs: 60_000, to: "supervisor" });
  });
});
