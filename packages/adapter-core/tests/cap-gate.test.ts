/**
 * 024 — cap-gated executor seam tests.
 *
 * The cap-gated contract: the executor's mutating surface (`invokeIntent`) is
 * reached ONLY via a kernel-shell-minted, single-use, resource-bound capability
 * that is BURNED from 022's atomic store and ed25519-VERIFIED (the injected
 * `verify`) BEFORE the side effect. These tests pin:
 *   - `invokeIntent` is reached when a valid single-use capability burns + verifies.
 *   - a SECOND use of the same capability is SUPPRESSED by 022's burn store
 *     (the single-use guarantee — get-and-delete, `persistence.ts` burn).
 *   - a capability that fails ed25519 verify is rejected (021-F1: the injected
 *     `verify` is the kernel-authority leg, NOT the forgeable hash-bind check).
 *   - a capability bound to a DIFFERENT intentHash is rejected (anti-IDOR /
 *     anti-replay).
 *   - a burn store / signer error fail-closes (§D #6 — no fail-open).
 *   - the gate is purely additive: OFF (default) is byte-identical to pre-024.
 */

import { describe, expect, it, vi } from "vitest";
import {
  bindCapability,
  buildEnvelope,
  decisionExecute,
  decisionRewrite,
  type Capability,
  type IntentEnvelope,
} from "@adjudicate/core";
import { translateDecision } from "../src/decisions.js";
import {
  createInMemoryBurnStore,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import type {
  AdopterExecutor,
  CapabilityGate,
} from "../src/types.js";

interface Payload {
  amountCentavos: number;
}
interface State {}

const KERNEL_ID = "kernel://test/cap-gate";

const envelope: IntentEnvelope<"pix.charge.refund", Payload> = buildEnvelope({
  kind: "pix.charge.refund",
  payload: { amountCentavos: 5000 },
  nonce: "n-cap-1",
  actor: { principal: "llm", sessionId: "s-1" },
  taint: "UNTRUSTED",
  createdAt: "2026-06-19T12:00:00.000Z",
});

const rewrittenEnvelope: IntentEnvelope<"pix.charge.refund", Payload> =
  buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 3000 },
    nonce: "n-cap-rw",
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    createdAt: "2026-06-19T12:00:00.000Z",
  });

function buildExecutor(): AdopterExecutor<"pix.charge.refund", Payload, State> {
  return {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => ({ refundId: "r-1", refunded: 5000 })),
  };
}

function baseCtx(
  executor: AdopterExecutor<"pix.charge.refund", Payload, State>,
  gate?: CapabilityGate,
) {
  return {
    envelope,
    toolUseId: "tu-1",
    sessionId: "s-1",
    state: {} as State,
    executor,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<unknown>(),
    historySnapshot: [] as unknown,
    rk: (raw: string) => raw,
    generateToken: () => "ct-fixed",
    ...(gate !== undefined ? { capabilityGate: gate } : {}),
  };
}

/**
 * Emulate the loop's shell-mint step: mint + sign the capability and persist it
 * into the gate's burn store keyed by the EFFECTIVE envelope nonce (exactly what
 * `mintCapabilityForDecision` in `loop.ts` does). `bindCapability` produces the
 * hash-bind shape; the ed25519 authority is modeled by the gate's `verify`.
 */
async function shellMint(gate: CapabilityGate, eff: IntentEnvelope): Promise<void> {
  const cap = bindCapability(
    { intentHash: eff.intentHash, kernelId: KERNEL_ID },
    "kernel-signer-1",
  );
  await gate.burnStore.mint(eff.nonce, cap, 60);
}

/** A gate whose `verify` accepts every well-formed capability (models a valid ed25519 sig). */
function acceptingGate(): CapabilityGate {
  return {
    mint: (body) => bindCapability(body, "kernel-signer-1"),
    verify: () => true,
    burnStore: createInMemoryBurnStore(),
    kernelId: KERNEL_ID,
  };
}

describe("024 cap-gated executor — single-use redemption", () => {
  it("reaches invokeIntent when a valid single-use capability burns + verifies", async () => {
    const executor = buildExecutor();
    const gate = acceptingGate();
    await shellMint(gate, envelope);

    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });

    expect(executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
    expect(t.loopAction).toEqual({ kind: "continue" });
  });

  it("SECOND use of the same capability is suppressed (022 burn single-use)", async () => {
    const executor = buildExecutor();
    const gate = acceptingGate();
    await shellMint(gate, envelope);

    // First redemption burns the grant and executes.
    const first = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
    expect(first.toolResult?.isError).toBeUndefined();

    // Second redemption WITHOUT re-minting: the burn store returns null (the
    // grant is already burned). The gate fail-closes — invokeIntent is NOT
    // called a second time. This is the at-most-once single-use guarantee.
    const second = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1); // still 1
    expect(second.toolResult?.isError).toBe(true);
    expect(second.toolResult?.content).toContain("capability gate");
  });

  it("a burn MISS (never minted) fail-closes — invokeIntent NOT reached", async () => {
    const executor = buildExecutor();
    const gate = acceptingGate();
    // Deliberately do NOT mint into the burn store.
    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
    expect(t.loopAction).toEqual({ kind: "continue" });
  });
});

describe("024 cap-gated executor — kernel-authority (ed25519) verify (021-F1)", () => {
  it("a capability that FAILS verify is rejected — invokeIntent NOT reached", async () => {
    const executor = buildExecutor();
    // verify always returns false: models a forged / unsigned capability that
    // the injected ed25519 verifier would reject. The hash-bind shape is still
    // self-consistent, proving the gate does NOT rely on hash-bind integrity for
    // authority (021-F1 footgun: integrity ≠ authorization).
    const gate: CapabilityGate = {
      mint: (body) => bindCapability(body, "kernel-signer-1"),
      verify: () => false,
      burnStore: createInMemoryBurnStore(),
      kernelId: KERNEL_ID,
    };
    await shellMint(gate, envelope);

    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });

  it("verify is actually consulted (toggling it flips the outcome) — non-vacuous", async () => {
    // Same store + capability, only `verify` differs → opposite outcomes. Proves
    // the ed25519 verify is load-bearing, not decorative.
    const mkGate = (verify: () => boolean): CapabilityGate => ({
      mint: (body) => bindCapability(body, "kernel-signer-1"),
      verify,
      burnStore: createInMemoryBurnStore(),
      kernelId: KERNEL_ID,
    });

    const okExec = buildExecutor();
    const okGate = mkGate(() => true);
    await shellMint(okGate, envelope);
    await translateDecision({ ...baseCtx(okExec, okGate), decision: decisionExecute([]) });
    expect(okExec.invokeIntent).toHaveBeenCalledTimes(1);

    const noExec = buildExecutor();
    const noGate = mkGate(() => false);
    await shellMint(noGate, envelope);
    await translateDecision({ ...baseCtx(noExec, noGate), decision: decisionExecute([]) });
    expect(noExec.invokeIntent).not.toHaveBeenCalled();
  });
});

describe("024 cap-gated executor — resource binding (intentHash) (anti-IDOR)", () => {
  it("a capability bound to a DIFFERENT intentHash is rejected even though it verifies", async () => {
    const executor = buildExecutor();
    const gate: CapabilityGate = {
      mint: (body) => bindCapability(body, "kernel-signer-1"),
      verify: () => true, // signature is "valid" — but bound to the wrong intent
      burnStore: createInMemoryBurnStore(),
      kernelId: KERNEL_ID,
    };
    // Mint a capability keyed by THIS envelope's nonce but bound to a DIFFERENT
    // intentHash (a cross-intent capability detached onto this envelope's nonce).
    const wrongCap: Capability = bindCapability(
      { intentHash: "b".repeat(64), kernelId: KERNEL_ID },
      "kernel-signer-1",
    );
    await gate.burnStore.mint(envelope.nonce, wrongCap, 60);

    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    // The bound intentHash != the effective envelope's intentHash → fail-closed.
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });
});

describe("024 cap-gated executor — fail-closed on store error (§D #6)", () => {
  it("a throwing burn store fail-closes — invokeIntent NOT reached, no fail-open", async () => {
    const executor = buildExecutor();
    const throwingStore = createInMemoryBurnStore();
    const gate: CapabilityGate = {
      mint: (body) => bindCapability(body, "kernel-signer-1"),
      verify: () => true,
      burnStore: {
        mint: throwingStore.mint.bind(throwingStore),
        burn: vi.fn(async () => {
          throw new Error("redis down");
        }),
      },
      kernelId: KERNEL_ID,
    };
    await gate.burnStore.mint(envelope.nonce, bindCapability(
      { intentHash: envelope.intentHash, kernelId: KERNEL_ID },
      "kernel-signer-1",
    ), 60);

    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionExecute([]),
    });
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });
});

describe("024 cap-gated executor — REWRITE path is gated on the rewritten envelope", () => {
  it("a valid capability for the REWRITTEN envelope's intentHash burns + executes the rewritten bytes", async () => {
    const executor = buildExecutor();
    const gate = acceptingGate();
    // The capability binds the REWRITTEN intentHash, keyed by the rewritten nonce
    // — exactly what the loop mints for a REWRITE decision.
    await shellMint(gate, rewrittenEnvelope);

    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionRewrite(rewrittenEnvelope, "amount clamped", []),
    });
    // 011 coexistence: the executor runs the REWRITTEN bytes, gated by the cap.
    expect(executor.invokeIntent).toHaveBeenCalledWith(rewrittenEnvelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });

  it("a REWRITE with NO capability minted fail-closes — rewritten bytes NOT executed", async () => {
    const executor = buildExecutor();
    const gate = acceptingGate();
    // Do NOT mint — the rewritten envelope has no grant.
    const t = await translateDecision({
      ...baseCtx(executor, gate),
      decision: decisionRewrite(rewrittenEnvelope, "amount clamped", []),
    });
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(t.toolResult?.isError).toBe(true);
  });
});

describe("024 cap-gated executor — additive / OFF by default (rollback dial)", () => {
  it("with NO gate configured, invokeIntent runs exactly as pre-024 (byte-identical seam)", async () => {
    const executor = buildExecutor();
    const t = await translateDecision({
      ...baseCtx(executor), // no gate
      decision: decisionExecute([]),
    });
    // Pre-024 behavior: the executor runs on a clean EXECUTE with no burn/verify.
    expect(executor.invokeIntent).toHaveBeenCalledWith(envelope, {});
    expect(t.toolResult?.isError).toBeUndefined();
  });
});
