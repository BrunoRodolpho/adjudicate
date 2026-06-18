import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  attestationMessage,
  createApprovalEngine,
  createConsoleLogChannel,
  createEd25519AttestationVerifier,
  createInMemoryApprovalRegistry,
  type ApprovalEngineOptions,
  type ApprovalRegistry,
} from "../src/index.js";
import { baseRequest, fakeAgent } from "./helpers.js";

/**
 * Wrap a registry so `get`/`put`/`markResolved` yield to the event loop (a
 * macrotask) before delegating — this opens the read-modify-write window inside
 * resolve() that the synchronous in-memory registry never exposes, so the test
 * actually fails without the per-token mutex (see the discriminating test below).
 */
function yieldingRegistry(inner: ApprovalRegistry): ApprovalRegistry {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    ...inner,
    async get(t) {
      await tick();
      return inner.get(t);
    },
    async put(r, ttl) {
      await tick();
      return inner.put(r, ttl);
    },
    async markResolved(t, s, by) {
      await tick();
      return inner.markResolved(t, s, by);
    },
  };
}

function makeEngine(
  extra: Partial<ApprovalEngineOptions<unknown, unknown, string[]>> = {},
  wrapRegistry: (r: ApprovalRegistry) => ApprovalRegistry = (r) => r,
) {
  const { agent, confirmCalls } = fakeAgent();
  const registry = wrapRegistry(
    createInMemoryApprovalRegistry({
      nowMs: () => 1_700_000_000_000,
      nowIso: () => "2026-05-01T12:00:00.000Z",
    }),
  );
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

describe("approval engine — quorum concurrency (#6)", () => {
  it("serializes concurrent resolves: every distinct approver is recorded, confirm() fires once", async () => {
    const { engine, confirmCalls } = makeEngine({ quorum: { minApprovals: 3 } });
    await engine.request(baseRequest);
    // Fire all three at once. Without per-token serialization each would read the
    // same empty `approvals`, append its own voter, and the last write would win —
    // losing two votes so quorum 3 is never reached (confirm() never fires).
    const results = await Promise.all([
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } }),
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "b" } }),
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "c" } }),
    ]);
    expect(confirmCalls.length).toBe(1);
    const resolved = results.find((r) => r.turn !== null);
    expect(resolved?.request.status).toBe("approved");
    expect(resolved?.request.approvals?.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("DISCRIMINATING: holds even when the registry yields mid read-modify-write (fails without the mutex)", async () => {
    // The stock in-memory registry resolves get/put synchronously, so it never
    // interleaves the RMW window — this test forces a yield between get and put,
    // so a no-mutex engine would lose 4 of 5 votes and never reach quorum. Run it
    // a few times to shake out scheduling nondeterminism.
    for (let iter = 0; iter < 20; iter += 1) {
      const { engine, confirmCalls } = makeEngine({ quorum: { minApprovals: 5 } }, yieldingRegistry);
      await engine.request(baseRequest);
      const results = await Promise.all(
        ["a", "b", "c", "d", "e"].map((id) => engine.resolve({ token: "tok-1", accepted: true, by: { id } })),
      );
      expect(confirmCalls.length, `iter ${iter}`).toBe(1);
      const resolved = results.find((r) => r.turn !== null);
      expect(resolved?.request.status).toBe("approved");
      expect(resolved?.request.approvals?.map((x) => x.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    }
  });

  it("concurrent resolves on different tokens are independent (no cross-token blocking)", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await engine.request({ ...baseRequest, token: "tok-2" });
    const [r1, r2] = await Promise.all([
      engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } }),
      engine.resolve({ token: "tok-2", accepted: true, by: { id: "b" } }),
    ]);
    expect(r1.request.status).toBe("approved");
    expect(r2.request.status).toBe("approved");
    expect(confirmCalls.length).toBe(2);
  });

  it("a rejected resolve does not wedge the per-token chain", async () => {
    const { engine } = makeEngine();
    await engine.request(baseRequest);
    await engine.resolve({ token: "tok-1", accepted: true, by: { id: "a" } }); // resolves it
    // A second resolve on the now-resolved token rejects; a later call must still run.
    await expect(engine.resolve({ token: "tok-1", accepted: true, by: { id: "b" } })).rejects.toThrow(/already/i);
    await expect(engine.resolve({ token: "tok-1", accepted: true, by: { id: "c" } })).rejects.toThrow(/already/i);
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

describe("approval engine — attestation binding (ADR-143 hardening)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const verifier = createEd25519AttestationVerifier({ alice: pem });
  // baseRequest.token === "tok-1", baseRequest.intentHash === "0xabc".
  const sig = (accepted: boolean, intentHash = "0xabc") =>
    cryptoSign(null, Buffer.from(attestationMessage({ token: "tok-1", accepted, intentHash }), "utf-8"), privateKey).toString("base64");

  it("rejects an outcome-flip: a decline-signature submitted as accept=true (H7)", async () => {
    const { engine, confirmCalls } = makeEngine({ attestationVerifier: verifier });
    await engine.request(baseRequest);
    await expect(
      engine.resolve({ token: "tok-1", accepted: true, attestation: { approverId: "alice", signature: sig(false) } }),
    ).rejects.toThrow(/attestation/i);
    expect(confirmCalls.length).toBe(0);
  });

  it("accepts a correctly-bound approve signature", async () => {
    const { engine, confirmCalls } = makeEngine({ attestationVerifier: verifier });
    await engine.request(baseRequest);
    const r = await engine.resolve({ token: "tok-1", accepted: true, attestation: { approverId: "alice", signature: sig(true) } });
    expect(r.request.status).toBe("approved");
    expect(confirmCalls.length).toBe(1);
  });

  it("records the verified approver id, never a forged input.by.id (H8)", async () => {
    const { engine } = makeEngine({ attestationVerifier: verifier });
    await engine.request(baseRequest);
    const r = await engine.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "ceo", displayName: "The Boss" }, // forged id + a display name
      attestation: { approverId: "alice", signature: sig(true) },
    });
    expect(r.request.resolvedBy?.id).toBe("alice"); // verified id wins over input.by.id
    expect(r.request.resolvedBy?.displayName).toBe("The Boss"); // only the name may come from input.by
  });
});

describe("approval engine — escalation", () => {
  it("stores the escalation policy on the request for an out-of-band scheduler", async () => {
    const { engine } = makeEngine();
    const req = await engine.request({ ...baseRequest, escalation: { afterMs: 60_000, to: "supervisor" } });
    expect(req.escalation).toEqual({ afterMs: 60_000, to: "supervisor" });
  });
});
