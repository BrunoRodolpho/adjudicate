/**
 * ADR-120 — the loop surfaces provider token usage via `onTokenUsage` after each
 * provider response, defensively (a throwing observer must not break the loop).
 */
import { describe, expect, it } from "vitest";
import { type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
  type TokenUsage,
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
    id: "token-usage-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { systemKinds: [] },
      business: [() => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] })],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan: () => ({ visibleReadTools: [] as const, allowedIntents: ["noun.make_pet"] as const }),
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
    basisCodes: ["state:transition_valid"],
  };
}

function bridge(usage: TokenUsage | undefined): ProviderBridge<string[]> {
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, r) => [...h, `tool_results:${r.length}`],
    async send(h) {
      const turn: AssistantTurn = usage
        ? { textBlocks: ["done"], toolUses: [], usage }
        : { textBlocks: ["done"], toolUses: [] };
      return { history: [...h, "assistant:done"], turn };
    },
  };
}

const renderer = {
  render: () => ({ systemPrompt: "p", maxTokens: 100, toolSchemas: [] }),
};
const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

function agentWith(
  usage: TokenUsage | undefined,
  onTokenUsage: AdjOpts["onTokenUsage"],
) {
  return createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    bridge: bridge(usage),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    onTokenUsage,
  });
}
type AdjOpts = Parameters<typeof createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>>[0];

const send = { sessionId: "s-1", userMessage: "hi", state: { count: 0 }, context: { userId: "u" } };

describe("onTokenUsage (ADR-120)", () => {
  it("fires once per iteration with the provider usage", async () => {
    const calls: Array<{ sessionId: string; iteration: number; usage: TokenUsage | undefined }> = [];
    const agent = agentWith({ inputTokens: 12, outputTokens: 34 }, (info) => calls.push(info));
    await agent.send(send);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ sessionId: "s-1", iteration: 1, usage: { inputTokens: 12, outputTokens: 34 } });
  });

  it("reports usage:undefined when the bridge omits it", async () => {
    const calls: Array<TokenUsage | undefined> = [];
    const agent = agentWith(undefined, (info) => calls.push(info.usage));
    await agent.send(send);
    expect(calls).toEqual([undefined]);
  });

  it("a throwing onTokenUsage does not break the loop", async () => {
    const agent = agentWith({ inputTokens: 1 }, () => {
      throw new Error("observer boom");
    });
    const result = await agent.send(send);
    expect(result.outcome.kind).toBe("completed");
  });
});
