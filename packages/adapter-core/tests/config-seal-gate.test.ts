/**
 * ADR-121 — the adapter loop verifies a config seal once per instance before any
 * adjudication. A valid seal is a no-op; a mismatch refuses the turn (and can
 * engage the kill switch) without ever calling the planner/bridge.
 */
import { describe, expect, it, vi } from "vitest";
import { type PackV0 } from "@adjudicate/core";
import { createRuntimeContext } from "@adjudicate/core/kernel";
import { sealPackConfig, type SealablePackInput } from "@adjudicate/conformance";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
} from "../src/index.js";

interface State {
  readonly count: number;
}
interface Context {
  readonly userId: string;
}
interface Payload {
  readonly name: string;
}

function buildPack(): PackV0<"noun.make_pet", Payload, State, Context> {
  return {
    id: "seal-pack",
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

function bridge(): ProviderBridge<string[]> & { sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async (h: string[]) => ({
    history: [...h, "assistant:done"],
    turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
  }));
  return {
    sendSpy,
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, r) => [...h, `tool_results:${r.length}`],
    send: sendSpy,
  };
}

const renderer = { render: () => ({ systemPrompt: "p", maxTokens: 100, toolSchemas: [] }) };
const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

const sealable = (): SealablePackInput => buildPack() as unknown as SealablePackInput;
const send = { sessionId: "s", userMessage: "hi", state: { count: 0 }, context: { userId: "u" } };

function agentWith(configSeal: Parameters<typeof createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>>[0]["configSeal"], br = bridge(), runtimeContext?: ReturnType<typeof createRuntimeContext>) {
  const agent = createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: br,
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    ...(configSeal ? { configSeal } : {}),
    ...(runtimeContext ? { runtimeContext } : {}),
  });
  return { agent, bridge: br };
}

describe("adapter config-seal gate (ADR-121)", () => {
  it("a valid seal lets the turn proceed normally", async () => {
    const seal = sealPackConfig(sealable());
    const { agent, bridge: br } = agentWith({ seal });
    const result = await agent.send(send);
    expect(result.outcome.kind).toBe("completed");
    expect(br.sendSpy).toHaveBeenCalled();
  });

  it("no configSeal option behaves exactly as before", async () => {
    const { agent } = agentWith(undefined);
    const result = await agent.send(send);
    expect(result.outcome.kind).toBe("completed");
  });

  it("a mismatched seal refuses the turn and never calls the bridge", async () => {
    const seal = { ...sealPackConfig(sealable()), digest: "0".repeat(64) };
    const { agent, bridge: br } = agentWith({ seal });
    const result = await agent.send(send);
    expect(result.outcome.kind).toBe("refused");
    if (result.outcome.kind === "refused") {
      expect(result.outcome.reason).toBe("config_seal_mismatch");
    }
    expect(br.sendSpy).not.toHaveBeenCalled();
  });

  it("engages the kill switch on mismatch when requested", async () => {
    const ctx = createRuntimeContext({ id: "seal-test" });
    const seal = { ...sealPackConfig(sealable()), digest: "0".repeat(64) };
    const { agent } = agentWith({ seal, engageKillSwitchOnMismatch: true }, bridge(), ctx);
    await agent.send(send);
    expect(ctx.killSwitch.isKilled()).toBe(true);
    expect(ctx.killSwitch.state().reason).toBe("config_seal_mismatch");
  });
});
