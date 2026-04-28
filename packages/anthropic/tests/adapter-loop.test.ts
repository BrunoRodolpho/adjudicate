import { describe, expect, it, vi } from "vitest";
import type {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import {
  decisionExecute,
  decisionRefuse,
  refuse,
  type AuditSink,
  type Decision,
  type IntentEnvelope,
  type PolicyBundle,
} from "@adjudicate/core";
import type { CapabilityPlanner, ToolSchema } from "@adjudicate/core/llm";
import { createAdjudicatedAgent } from "../src/adapter.js";
import {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
} from "../src/persistence.js";
import { createAnthropicPromptRenderer } from "../src/renderer-anthropic.js";
import type { AdopterExecutor } from "../src/types.js";

type Kind = "demo.do_thing";
interface Payload {
  thing: string;
}
interface State {
  counter: number;
}
interface Context {
  userId: string;
}

const toolSchemas: ToolSchema[] = [
  {
    name: "demo.do_thing",
    description: "Demo intent",
    input_schema: {
      type: "object",
      properties: { thing: { type: "string" } },
      required: ["thing"],
    },
  },
];

function buildTestPack(decisionFn: (env: IntentEnvelope<Kind, Payload>, state: State) => Decision) {
  const planner: CapabilityPlanner<State, Context> = {
    plan: () => ({
      visibleReadTools: [],
      allowedIntents: ["demo.do_thing"],
      forbiddenConcepts: [],
    }),
  };
  const policy: PolicyBundle<Kind, Payload, State> = {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [(env, state) => decisionFn(env, state)],
    default: "REFUSE",
  };
  return {
    id: "pack-test",
    version: "0.0.1",
    contract: "v0" as const,
    intents: ["demo.do_thing"] as const,
    policy,
    planner,
    basisCodes: ["demo.refused"],
  };
}

interface CannedTurn {
  text?: string;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
}

function mockAnthropic(turns: CannedTurn[]) {
  const create = vi.fn(async () => {
    const turn = turns.shift();
    if (turn === undefined) {
      throw new Error("mockAnthropic: no more canned turns");
    }
    const content: Message["content"] = [];
    if (turn.text) content.push({ type: "text", text: turn.text, citations: null });
    if (turn.toolUses) {
      for (const tu of turn.toolUses) {
        const block: ToolUseBlock = {
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input as Record<string, unknown>,
        };
        content.push(block);
      }
    }
    return {
      id: "msg-mock",
      type: "message",
      role: "assistant",
      content,
      model: "test-model",
      stop_reason: turn.toolUses?.length ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as Message;
  });
  const client = { messages: { create } } as unknown as Parameters<
    typeof createAdjudicatedAgent
  >[0]["anthropicClient"];
  return { client, create };
}

function buildExecutor(): AdopterExecutor<Kind, Payload, State> {
  return {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async (env) => ({
      did: env.payload.thing,
    })),
  };
}

describe("createAdjudicatedAgent — send loop", () => {
  it("calls planner every iteration; tool_use → adjudicate → tool_result → completed", async () => {
    const pack = buildTestPack(() => decisionExecute([]));
    const planSpy = vi.spyOn(pack.planner, "plan");
    const executor = buildExecutor();
    const sink: AuditSink = { emit: vi.fn(async () => {}) };
    const { client } = mockAnthropic([
      { toolUses: [{ id: "tu-1", name: "demo.do_thing", input: { thing: "x" } }] },
      { text: "Done." },
    ]);

    const agent = createAdjudicatedAgent<Kind, Payload, State, Context>({
      pack,
      anthropicClient: client,
      model: "test-model",
      maxTokens: 256,
      renderer: createAnthropicPromptRenderer<State, Context>({
        packId: pack.id,
        toolSchemas,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      auditSink: sink,
      executor,
    });

    const result = await agent.send({
      sessionId: "s-1",
      userMessage: "Do the thing.",
      state: { counter: 0 },
      context: { userId: "u-1" },
    });

    expect(result.outcome.kind).toBe("completed");
    if (result.outcome.kind === "completed") {
      expect(result.outcome.assistantText).toBe("Done.");
    }

    // Planner called twice: once before the tool_use turn, once before the
    // final assistant turn that produced text only.
    expect(planSpy).toHaveBeenCalledTimes(2);

    // adjudicate fired once with an UNTRUSTED, principal=llm envelope.
    const decisionEvents = result.events.filter((e) => e.kind === "decision");
    expect(decisionEvents).toHaveLength(1);
    if (decisionEvents[0].kind === "decision") {
      expect(decisionEvents[0].envelope.taint).toBe("UNTRUSTED");
      expect(decisionEvents[0].envelope.actor.principal).toBe("llm");
    }

    // Audit sink received exactly one record.
    expect(sink.emit).toHaveBeenCalledTimes(1);

    // Executor invoked once.
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
  });

  it("REFUSE → tool_result is_error=true; loop continues to next assistant turn", async () => {
    const pack = buildTestPack(() =>
      decisionRefuse(refuse("BUSINESS_RULE", "demo.refused", "Nope."), []),
    );
    const executor = buildExecutor();
    const { client } = mockAnthropic([
      { toolUses: [{ id: "tu-1", name: "demo.do_thing", input: { thing: "x" } }] },
      { text: "I cannot do that." },
    ]);
    const agent = createAdjudicatedAgent<Kind, Payload, State, Context>({
      pack,
      anthropicClient: client,
      model: "test-model",
      maxTokens: 256,
      renderer: createAnthropicPromptRenderer<State, Context>({
        packId: pack.id,
        toolSchemas,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      executor,
    });
    const result = await agent.send({
      sessionId: "s-1",
      userMessage: "Do the thing.",
      state: { counter: 0 },
      context: { userId: "u-1" },
    });
    expect(result.outcome.kind).toBe("completed");
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("max_iterations_exceeded when the LLM keeps emitting tool_use", async () => {
    const pack = buildTestPack(() => decisionExecute([]));
    const executor = buildExecutor();
    const turns: CannedTurn[] = [];
    for (let i = 0; i < 12; i++) {
      turns.push({
        toolUses: [{ id: `tu-${i}`, name: "demo.do_thing", input: { thing: `x${i}` } }],
      });
    }
    const { client } = mockAnthropic(turns);
    const agent = createAdjudicatedAgent<Kind, Payload, State, Context>({
      pack,
      anthropicClient: client,
      model: "test-model",
      maxTokens: 256,
      renderer: createAnthropicPromptRenderer<State, Context>({
        packId: pack.id,
        toolSchemas,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      executor,
      maxIterations: 3,
    });
    const result = await agent.send({
      sessionId: "s-1",
      userMessage: "Loop forever.",
      state: { counter: 0 },
      context: { userId: "u-1" },
    });
    expect(result.outcome.kind).toBe("max_iterations_exceeded");
  });

  it("hallucinated tool name → out_of_plan tool_result; loop continues", async () => {
    const pack = buildTestPack(() => decisionExecute([]));
    const executor = buildExecutor();
    const { client } = mockAnthropic([
      { toolUses: [{ id: "tu-1", name: "ghost_tool", input: {} }] },
      { text: "OK." },
    ]);
    const agent = createAdjudicatedAgent<Kind, Payload, State, Context>({
      pack,
      anthropicClient: client,
      model: "test-model",
      maxTokens: 256,
      renderer: createAnthropicPromptRenderer<State, Context>({
        packId: pack.id,
        toolSchemas,
      }),
      deferStore: createInMemoryDeferStore(),
      confirmationStore: createInMemoryConfirmationStore(),
      executor,
    });
    const result = await agent.send({
      sessionId: "s-1",
      userMessage: "Try a fake tool.",
      state: { counter: 0 },
      context: { userId: "u-1" },
    });
    expect(result.outcome.kind).toBe("completed");
    // Adjudicate must NOT have been called for an unknown tool name.
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    const toolResults = result.events.filter((e) => e.kind === "tool_result");
    expect(toolResults).toHaveLength(1);
  });
});
