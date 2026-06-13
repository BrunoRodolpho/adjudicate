import { describe, expect, it, vi } from "vitest";
import { type PackV0 } from "@adjudicate/core";
import {
  createAdjudicatedAgent,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  type AdopterExecutor,
  type AssistantTurn,
  type ProviderBridge,
  type ToolUseRequest,
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
    id: "catch-test-pack",
    version: "0.1.0",
    contract: "v0",
    intents: ["noun.make_pet"],
    policy: {
      stateGuards: [],
      authGuards: [],
      taint: { minimumFor: () => "UNTRUSTED" as const },
      business: [
        () => ({ kind: "EXECUTE", basis: [{ category: "state", code: "transition_valid" }] }),
      ],
      default: "REFUSE",
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["policy"],
    planner: {
      plan() {
        return { visibleReadTools: [] as const, allowedIntents: ["noun.make_pet"] as const };
      },
    } as unknown as PackV0<"noun.make_pet", Payload, State, Context>["planner"],
    basisCodes: ["state:transition_valid"],
  };
}

function bridge(toolUses: ToolUseRequest[]): ProviderBridge<string[]> {
  let called = 0;
  return {
    emptyHistory: () => [],
    appendUserMessage: (h, m) => [...h, `user:${m}`],
    appendToolResults: (h, results) => [...h, `tool_results:${results.length}`],
    async send(h) {
      called++;
      if (called === 1 && toolUses.length > 0) {
        return {
          history: [...h, "assistant:turn-1"],
          turn: { textBlocks: [], toolUses } satisfies AssistantTurn,
        };
      }
      return {
        history: [...h, "assistant:done"],
        turn: { textBlocks: ["done"], toolUses: [] } satisfies AssistantTurn,
      };
    },
  };
}

const renderer = {
  render() {
    return { systemPrompt: "p", maxTokens: 100, toolSchemas: [] };
  },
};
const executor: AdopterExecutor<"noun.make_pet", Payload, State> = {
  async invokeRead() {
    return null;
  },
  async invokeIntent() {
    return { ok: true };
  },
};

type OnCatch = (info: {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  reason: "out_of_plan";
}) => void;

function makeAgent(opts: { onCatch?: OnCatch } = {}) {
  return createAdjudicatedAgent<"noun.make_pet", Payload, State, Context, string[]>({
    pack: buildPack(),
    renderer,
    // "evil.tool" is neither an allowed intent nor a read tool -> out_of_plan.
    bridge: bridge([{ id: "tu-evil", name: "evil.tool", input: { x: 1 } }]),
    deferStore: createInMemoryDeferStore(),
    confirmationStore: createInMemoryConfirmationStore<string[]>(),
    ledger: createMemoryLedger(),
    executor,
    ...(opts.onCatch ? { onCatch: opts.onCatch } : {}),
  });
}

const run = (agent: ReturnType<typeof makeAgent>) =>
  agent.send({ sessionId: "s-catch", userMessage: "go", state: { count: 0 }, context: { userId: "u" } });

describe("loop out-of-plan catch (item 7)", () => {
  it("emits a tool_blocked event for an out-of-plan tool call", async () => {
    const result = await run(makeAgent());
    const blocked = result.events.filter((e) => e.kind === "tool_blocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      kind: "tool_blocked",
      toolUseId: "tu-evil",
      toolName: "evil.tool",
      reason: "out_of_plan",
    });
  });

  it("invokes the guarded onCatch hook with the catch info", async () => {
    const onCatch = vi.fn();
    await run(makeAgent({ onCatch }));
    expect(onCatch).toHaveBeenCalledTimes(1);
    expect(onCatch).toHaveBeenCalledWith({
      sessionId: "s-catch",
      toolUseId: "tu-evil",
      toolName: "evil.tool",
      reason: "out_of_plan",
    });
  });

  it("a throwing onCatch never breaks the loop (guarded observer)", async () => {
    const onCatch = vi.fn(() => {
      throw new Error("observer boom");
    });
    const result = await run(makeAgent({ onCatch }));
    expect(onCatch).toHaveBeenCalledTimes(1);
    expect(result.outcome.kind).toBe("completed");
    expect(result.events.some((e) => e.kind === "tool_blocked")).toBe(true);
  });
});
