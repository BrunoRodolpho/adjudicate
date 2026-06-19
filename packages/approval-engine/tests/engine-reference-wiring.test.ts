import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  createApprovalEngine,
  createConsoleLogChannel,
  createInMemoryApprovalRegistry,
} from "../src/index.js";
import { attestationMessage, createEd25519AttestationVerifier } from "../src/governance.js";
import { fakeAgent, baseRequest } from "./helpers.js";

/**
 * WS-B — reference wiring for attestation-enforced, quorum-gated approvals
 * (ADR-143). This is the recommended adopter setup: an engine configured with
 * `createEd25519AttestationVerifier` + a `quorum` policy. It also pins the
 * per-request quorum stamp (the projection is self-describing so operator UIs
 * can render N/minApprovals without the engine's global config).
 */

function key() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function attest(approverId: string, privateKeyPem: string, accepted: boolean) {
  const msg = Buffer.from(
    attestationMessage({ token: baseRequest.token, accepted, intentHash: baseRequest.intentHash }),
    "utf-8",
  );
  return { approverId, signature: cryptoSign(null, msg, privateKeyPem).toString("base64") };
}

function makeEngine(quorumPolicy?: { minApprovals: number; distinctApprovers?: boolean }) {
  const alice = key();
  const bob = key();
  const { agent, confirmCalls } = fakeAgent();
  const engine = createApprovalEngine<unknown, unknown, string[]>({
    agent,
    registry: createInMemoryApprovalRegistry(),
    channels: [createConsoleLogChannel()],
    resolveStateContext: async () => ({ state: {}, context: {} }),
    now: () => "2026-06-17T12:00:00.000Z",
    // ── the reference governance wiring ──
    attestationVerifier: createEd25519AttestationVerifier({
      alice: alice.publicKey,
      bob: bob.publicKey,
    }),
    quorum: quorumPolicy ?? { minApprovals: 2, distinctApprovers: true },
  });
  return { engine, confirmCalls, alice, bob };
}

describe("reference wiring — attestation + quorum", () => {
  it("stamps the quorum policy into the request projection (UI can render N/M)", async () => {
    const { engine } = makeEngine();
    const req = await engine.request(baseRequest);
    expect(req.quorum).toEqual({ minApprovals: 2, distinctApprovers: true });
  });

  it("requires a 2-of-2 attested quorum before the underlying confirm() runs", async () => {
    const { engine, confirmCalls, alice, bob } = makeEngine();
    await engine.request(baseRequest);

    // First attested approval: quorum 1/2 — accumulates, does NOT confirm yet.
    const first = await engine.resolve({
      token: baseRequest.token,
      accepted: true,
      attestation: attest("alice", alice.privateKey, true),
    });
    expect(first.turn).toBeNull();
    expect(first.request.approvals).toHaveLength(1);
    expect(confirmCalls).toHaveLength(0);

    // Second distinct attested approval: quorum 2/2 — confirm() runs.
    const second = await engine.resolve({
      token: baseRequest.token,
      accepted: true,
      attestation: attest("bob", bob.privateKey, true),
    });
    expect(second.request.status).toBe("approved");
    expect(second.request.approvals).toHaveLength(2);
    expect(confirmCalls).toHaveLength(1);
  });

  it("rejects a resolve with no attestation when the verifier is configured", async () => {
    const { engine, confirmCalls } = makeEngine();
    await engine.request(baseRequest);
    await expect(engine.resolve({ token: baseRequest.token, accepted: true })).rejects.toThrow();
    expect(confirmCalls).toHaveLength(0);
  });

  it("rejects a forged attestation (wrong signature)", async () => {
    const { engine, bob } = makeEngine();
    await engine.request(baseRequest);
    // Sign with bob's key but claim to be alice → verifier fails closed.
    await expect(
      engine.resolve({
        token: baseRequest.token,
        accepted: true,
        attestation: { approverId: "alice", signature: attest("bob", bob.privateKey, true).signature },
      }),
    ).rejects.toThrow();
  });

  // ── 071 — end-to-end: the bound approver is the CRYPTOGRAPHICALLY-VERIFIED
  // attestation.approverId, never the unauthenticated `input.by`, and the
  // request's channel is bound. Pinned with a 1-of-1 quorum so a single attested
  // resolve fires confirm() and we can inspect the forwarded receipt binding.
  it("071: threads the verified approver + channel binding tuple into the forwarded receipt", async () => {
    const { engine, confirmCalls, alice } = makeEngine({ minApprovals: 1 });
    await engine.request(baseRequest); // channel routed to "console-log"

    const res = await engine.resolve({
      token: baseRequest.token,
      accepted: true,
      // The forgeable display claim says "mallory" — it must NOT become the
      // bound approver; only the verified attestation.approverId may.
      by: { id: "mallory", displayName: "Mallory" },
      attestation: attest("alice", alice.privateKey, true),
    });

    expect(res.request.status).toBe("approved");
    expect(confirmCalls).toHaveLength(1);
    expect(confirmCalls[0]!.binding).toEqual({
      approver: { confirmed: "alice" }, // verified id, NOT "mallory"
      channel: { confirmed: "console-log", requested: "console-log" },
    });
  });
});
