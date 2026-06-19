/**
 * 084 — the CANARY-stage config-seal posture (`canaryStageConfigSeal`).
 *
 * At the canary stage of a staged rollout the loop MUST enforce the strict seal
 * knobs (`policy:"require_signature"` + `engageKillSwitchOnMismatch:true` +
 * `reverify:"every_turn"`) so a seal DRIFT LATCHES the kill switch (fail-closed)
 * rather than only refusing the current turn and SELF-HEALING the next (the lax
 * deprecation-window default the loop still allows for normal turns).
 *
 * Contrast: the lax default (loop.ts L1 warning, ADR-137) refuses ONLY the
 * drifting turn and self-heals once the pack/seal is fixed. This suite proves
 * the canary posture is strictly more friction (§C/§D-7 monotonicity), and that
 * `canaryStageConfigSeal` constructs exactly that fail-closed posture.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type PackV0 } from "@adjudicate/core";
import { createRuntimeContext } from "@adjudicate/core/kernel";
import { sealPackConfig, type ConfigSeal, type SealablePackInput } from "@adjudicate/conformance";
import {
  canaryStageConfigSeal,
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AgentConfigSealOptions,
  type AssistantTurn,
  type ProviderBridge,
} from "../src/index.js";

interface State { readonly count: number; }
interface Context { readonly userId: string; }
interface Payload { readonly name: string; }

function buildPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "canary-seal-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    signals: [],
    basisCodes: ["state:transition_valid"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" },
      business: [() => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] })],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan: () => ({ visibleReadTools: [] as const, allowedIntents: ["noun.make_pet"] as const }),
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
  };
}

function bridge(): ProviderBridge<string[]> & { sendCount: () => number } {
  let calls = 0;
  return {
    sendCount: () => calls,
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, r) => [...h, `tool_results:${r.length}`],
    async send(h: string[]) {
      calls += 1;
      return {
        history: [...h, "assistant:done"],
        turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
      };
    },
  };
}

const renderer = { render: () => ({ systemPrompt: "p", maxTokens: 100, toolSchemas: [] }) };
const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() { return null; },
  async invokeIntent() { return { ok: true }; },
};
const sealable = (): SealablePackInput => buildPack() as unknown as SealablePackInput;
const send = { sessionId: "s", userMessage: "hi", state: { count: 0 }, context: { userId: "u" } };

function ed25519() {
  const kp = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function agentWith(
  configSeal: AgentConfigSealOptions,
  br: ReturnType<typeof bridge>,
  runtimeContext: ReturnType<typeof createRuntimeContext>,
) {
  return createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: br,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    configSeal,
    runtimeContext,
  });
}

describe("canaryStageConfigSeal — fail-closed canary-stage posture (084 T4)", () => {
  it("forces the strict knobs: require_signature + engageKillSwitchOnMismatch + every_turn", () => {
    const { publicKeyPem } = ed25519();
    const cfg = canaryStageConfigSeal({
      seal: sealPackConfig(sealable()),
      publicKeyPem,
    });
    expect(cfg.policy).toBe("require_signature");
    expect(cfg.engageKillSwitchOnMismatch).toBe(true);
    expect(cfg.reverify).toBe("every_turn");
    expect(cfg.publicKeyPem).toBe(publicKeyPem);
  });

  it("a VALID signed seal proceeds and does NOT engage the kill switch", async () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const seal = sealPackConfig(sealable(), { privateKeyPem });
    const ctx = createRuntimeContext({ id: "canary-valid" });
    const br = bridge();
    const agent = agentWith(canaryStageConfigSeal({ seal, publicKeyPem }), br, ctx);
    const result = await agent.send(send);
    expect(result.outcome.kind).toBe("completed");
    expect(br.sendCount()).toBe(1);
    expect(ctx.killSwitch.isKilled()).toBe(false);
  });

  it("a drift LATCHES the kill switch and does NOT self-heal next turn (contrast the lax default)", async () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    // Sign over the WRONG digest so the seal drifts from the live pack.
    const driftedSeal: ConfigSeal = {
      ...sealPackConfig(sealable(), { privateKeyPem }),
      digest: "0".repeat(64),
    };
    const ctx = createRuntimeContext({ id: "canary-drift" });
    const br = bridge();
    const agent = agentWith(canaryStageConfigSeal({ seal: driftedSeal, publicKeyPem }), br, ctx);

    // Turn 1: drift refuses the turn AND engages (latches) the kill switch.
    const t1 = await agent.send(send);
    expect(t1.outcome.kind).toBe("refused");
    if (t1.outcome.kind === "refused") expect(t1.outcome.reason).toBe("config_seal_mismatch");
    expect(br.sendCount()).toBe(0);
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("config_seal_mismatch");

    // Turn 2: even if the operator now presents a VALID seal, the LATCH holds —
    // the same agent's runtime context is killed, so the turn is still refused.
    // This is the property the canary stage requires: no self-heal.
    const t2 = await agent.send(send);
    expect(t2.outcome.kind).toBe("refused");
    // The bridge is STILL never reached — friction did not relax (§C monotonicity).
    expect(br.sendCount()).toBe(0);
    expect(ctx.killSwitch.isKilled()).toBe(true);
  });

  it("CONTRAST: the lax default (no engageKillSwitchOnMismatch) self-heals once the seal is fixed", async () => {
    const { publicKeyPem, privateKeyPem } = ed25519();
    const validSeal = sealPackConfig(sealable(), { privateKeyPem });
    const driftedSeal: ConfigSeal = { ...validSeal, digest: "0".repeat(64) };
    const ctx = createRuntimeContext({ id: "lax-default" });
    const br = bridge();

    // A LAX config (NOT canaryStageConfigSeal): no kill switch, digest-only.
    const laxAgent = createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
      pack: buildPack(),
      renderer,
      bridge: br,
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor,
      configSeal: { seal: driftedSeal, reverify: "every_turn" },
      runtimeContext: ctx,
    });

    // Turn 1: drift refuses, but the kill switch is NOT engaged (lax).
    const t1 = await laxAgent.send(send);
    expect(t1.outcome.kind).toBe("refused");
    expect(ctx.killSwitch.isKilled()).toBe(false);

    // Now a SECOND agent over the SAME context with a fixed (valid) seal proceeds
    // — proving the lax posture self-heals (the canary posture above does NOT).
    const healed = createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
      pack: buildPack(),
      renderer,
      bridge: br,
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore<string[]>(),
      ledger: createMemoryLedger(),
      executor,
      configSeal: { seal: validSeal, reverify: "every_turn" },
      runtimeContext: ctx,
    });
    const t2 = await healed.send(send);
    expect(t2.outcome.kind).toBe("completed");
  });
});
