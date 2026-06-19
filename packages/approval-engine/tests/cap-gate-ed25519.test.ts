/**
 * 024 — the cap-gated executor's KERNEL-AUTHORITY leg, end-to-end with REAL
 * ed25519 (021-F1 footgun).
 *
 * The cap gate (`@adjudicate/adapter-core`) is DI-shaped: the adopter wires
 * `mint`/`verify`. This package owns the node-side ed25519 crypto
 * (`signCapability` / `verifyCapabilitySignature`). Here we wire the REAL signer
 * + verifier into a `CapabilityGate` and drive the actual executor seam
 * (`translateDecision`) to prove:
 *
 *   - a properly ed25519-SIGNED capability burns + verifies → the executor runs.
 *   - a HASH-BIND-ONLY capability (`bindCapability`, alg "sha256-hashbind") — the
 *     forgeable integrity leg — is REJECTED by `verifyCapabilitySignature`, so it
 *     NEVER reaches the executor. This is the 021-F1 footgun closed in practice:
 *     kernel authority is ed25519, NOT the hash-bind self-consistency check.
 *   - a capability ed25519-signed for intent A cannot be redeemed for intent B
 *     (cross-intent replay fails closed).
 */

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  bindCapability,
  buildEnvelope,
  decisionExecute,
  type Capability,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  createInMemoryBurnStore,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  translateDecision,
  type AdopterExecutor,
  type CapabilityGate,
} from "@adjudicate/adapter-core";
import { signCapability, verifyCapabilitySignature } from "../src/index.js";

const KERNEL_ID = "kernel://prod/us-east-1";
const KEY_ID = "kernel-signer-1";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const pubByKeyId = { [KEY_ID]: publicKeyPem };

interface Payload {
  amountCentavos: number;
}

const envelope: IntentEnvelope<"pix.charge.refund", Payload> = buildEnvelope({
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  nonce: "n-ae-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  createdAt: "2026-06-19T12:00:00.000Z",
});

function executor(): AdopterExecutor<"pix.charge.refund", Payload, Record<string, never>> {
  return {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => ({ refundId: "r-1" })),
  };
}

/** The production gate: REAL ed25519 signer + verifier wired in. */
function ed25519Gate(): CapabilityGate {
  return {
    mint: (body) => signCapability({ body, privateKeyPem, keyId: KEY_ID }),
    verify: (cap: Capability) => verifyCapabilitySignature(cap, pubByKeyId),
    burnStore: createInMemoryBurnStore(),
    kernelId: KERNEL_ID,
  };
}

function ctx(
  exec: AdopterExecutor<"pix.charge.refund", Payload, Record<string, never>>,
  gate: CapabilityGate,
) {
  return {
    envelope,
    toolUseId: "tu-1",
    sessionId: "s-1",
    state: {} as Record<string, never>,
    executor: exec,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<unknown>(),
    historySnapshot: [] as unknown,
    rk: (raw: string) => raw,
    generateToken: () => "ct-fixed",
    capabilityGate: gate,
    decision: decisionExecute([]),
  };
}

describe("024 cap gate + REAL ed25519 (021-F1: kernel authority is ed25519, not hash-bind)", () => {
  it("an ed25519-SIGNED capability burns + verifies → executor reached", async () => {
    const gate = ed25519Gate();
    const exec = executor();
    // Shell-mint: sign over the envelope's intentHash and persist into the store.
    const cap = await gate.mint({ intentHash: envelope.intentHash, kernelId: KERNEL_ID });
    await gate.burnStore.mint(envelope.nonce, cap, 60);

    const t = await translateDecision(ctx(exec, gate));
    expect(exec.invokeIntent).toHaveBeenCalledWith(envelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });

  it("a HASH-BIND-ONLY capability is REJECTED — the forgeable integrity leg is not authority (021-F1)", async () => {
    const gate = ed25519Gate();
    const exec = executor();
    // Forge a self-consistent hash-bind capability (alg "sha256-hashbind"). It
    // passes core's pure-JS `verifyCapability` (integrity) but is NOT ed25519 —
    // so `verifyCapabilitySignature` (the wired `verify`) rejects it.
    const forged: Capability = bindCapability(
      { intentHash: envelope.intentHash, kernelId: KERNEL_ID },
      KEY_ID,
    );
    expect(forged.signature.alg).toBe("sha256-hashbind");
    // Sanity: the gate's verify (ed25519) rejects the hash-bind forgery.
    expect(gate.verify(forged)).toBe(false);
    await gate.burnStore.mint(envelope.nonce, forged, 60);

    const t = await translateDecision(ctx(exec, gate));
    // Fail-closed: a hash-bind-only capability NEVER reaches the executor.
    expect(exec.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });

  it("CROSS-INTENT replay fails closed: a cap ed25519-signed for intent A cannot redeem intent B", async () => {
    const gate = ed25519Gate();
    const exec = executor();
    // Sign a capability for a DIFFERENT intentHash, then plant it on this
    // envelope's nonce. ed25519 verify is over the bound intentHash's pre-image,
    // so the planted intentHash mismatch makes the signature invalid AND the
    // intentHash-bind check in runExecute also fails — either way fail-closed.
    const capForOther = signCapability({
      body: { intentHash: "a".repeat(64), kernelId: KERNEL_ID },
      privateKeyPem,
      keyId: KEY_ID,
    });
    // Move the signature onto a capability claiming THIS envelope's intentHash.
    const replayed: Capability = { ...capForOther, intentHash: envelope.intentHash };
    expect(gate.verify(replayed)).toBe(false); // signature no longer matches the pre-image
    await gate.burnStore.mint(envelope.nonce, replayed, 60);

    const t = await translateDecision(ctx(exec, gate));
    expect(exec.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });
});
