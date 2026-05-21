/**
 * Unit tests for the OpenAI ProviderBridge.
 *
 * Verifies the mapping from the OpenAI Chat Completions wire shapes to
 * the provider-neutral `AssistantTurn` / `ToolResultBlock` shapes that
 * the adapter-core loop consumes. The bridge is the ONLY place in the
 * codebase that knows about OpenAI's tool_calls / role: "tool" layout —
 * the loop must remain provider-agnostic.
 */

import { describe, expect, it, vi } from "vitest";
import { createOpenAIBridge } from "../src/bridge-openai.js";
import type {
  OpenAIChatLikeClient,
  OpenAIMessage,
} from "../src/openai-types.js";

function fakeClient(canned: {
  text?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}): OpenAIChatLikeClient {
  const create = vi.fn(async () => ({
    choices: [
      {
        message: {
          role: "assistant" as const,
          content: canned.text ?? null,
          ...(canned.toolCalls && canned.toolCalls.length > 0
            ? {
                tool_calls: canned.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              }
            : {}),
        },
        finish_reason: canned.toolCalls?.length ? "tool_calls" : "stop",
      },
    ],
  }));
  return { chat: { completions: { create } } };
}

describe("createOpenAIBridge", () => {
  it("appendUserMessage adds a role:user message", () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({}),
      model: "gpt-test",
    });
    const h = bridge.appendUserMessage(bridge.emptyHistory(), "hello");
    expect(h).toEqual([{ role: "user", content: "hello" }]);
  });

  it("send maps tool_calls to ToolUseRequest with parsed JSON input", async () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({
        toolCalls: [
          {
            id: "call_1",
            name: "pix_charge_create",
            arguments: JSON.stringify({ amountCentavos: 5000 }),
          },
        ],
      }),
      model: "gpt-test",
    });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "sys",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.toolUses).toEqual([
      {
        id: "call_1",
        name: "pix_charge_create",
        input: { amountCentavos: 5000 },
      },
    ]);
  });

  it("send preserves assistant text content alongside tool_calls", async () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({
        text: "Working on it…",
        toolCalls: [
          {
            id: "call_2",
            name: "list_pix_charges",
            arguments: "{}",
          },
        ],
      }),
      model: "gpt-test",
    });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "sys",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.textBlocks).toEqual(["Working on it…"]);
    expect(turn.toolUses).toHaveLength(1);
  });

  it("send tolerates malformed JSON arguments (surfaces as __raw)", async () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({
        toolCalls: [
          {
            id: "call_bad",
            name: "x",
            arguments: "{not json",
          },
        ],
      }),
      model: "gpt-test",
    });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "sys",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.toolUses[0]?.input).toEqual({ __raw: "{not json" });
  });

  it("appendToolResults fans a list out to role:tool messages", () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({}),
      model: "gpt-test",
    });
    const h: ReadonlyArray<OpenAIMessage> = [];
    const next = bridge.appendToolResults(h, [
      { toolUseId: "call_1", content: "ok" },
      { toolUseId: "call_2", content: "Tool failed: …", isError: true },
    ]);
    expect(next).toEqual([
      { role: "tool", tool_call_id: "call_1", content: "ok" },
      { role: "tool", tool_call_id: "call_2", content: "Tool failed: …" },
    ]);
  });

  it("send appends the assistant response to history", async () => {
    const bridge = createOpenAIBridge({
      client: fakeClient({ text: "done" }),
      model: "gpt-test",
    });
    const start = bridge.appendUserMessage(bridge.emptyHistory(), "hi");
    const { history } = await bridge.send(start, {
      systemPrompt: "sys",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({
      role: "assistant",
      content: "done",
    });
  });

  it("send prepends the system prompt to the outgoing request", async () => {
    const create = vi.fn(async () => ({
      choices: [
        {
          message: { role: "assistant" as const, content: "" },
          finish_reason: "stop",
        },
      ],
    }));
    const client: OpenAIChatLikeClient = {
      chat: { completions: { create } },
    };
    const bridge = createOpenAIBridge({ client, model: "gpt-test" });

    const userOnly = bridge.appendUserMessage(bridge.emptyHistory(), "hi");
    await bridge.send(userOnly, {
      systemPrompt: "you are an assistant",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0]?.[0];
    expect(req.messages[0]).toEqual({
      role: "system",
      content: "you are an assistant",
    });
    expect(req.messages[1]).toEqual({ role: "user", content: "hi" });
  });
});
