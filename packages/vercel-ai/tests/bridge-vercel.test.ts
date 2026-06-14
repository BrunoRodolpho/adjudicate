/**
 * Unit tests for the Vercel AI ProviderBridge.
 *
 * Verifies the mapping from the AI SDK `generateText` wire shapes to the
 * provider-neutral `AssistantTurn` / `ToolResultBlock` shapes that the
 * adapter-core loop consumes. The bridge is the ONLY place in the
 * codebase that knows about the AI SDK's toolCalls / role: "tool" layout
 * — the loop must remain provider-agnostic.
 */

import { describe, expect, it, vi } from "vitest";
import { createVercelBridge } from "../src/bridge-vercel.js";
import type {
  VercelGenerateTextFn,
  VercelMessage,
} from "../src/vercel-types.js";

function fakeGenerateText(canned: {
  text?: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
}): VercelGenerateTextFn {
  return vi.fn(async () => ({
    text: canned.text ?? "",
    ...(canned.toolCalls && canned.toolCalls.length > 0
      ? {
          toolCalls: canned.toolCalls.map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.input,
          })),
        }
      : {}),
  }));
}

describe("createVercelBridge", () => {
  it("appendUserMessage adds a role:user message", () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({}),
      model: {},
    });
    const h = bridge.appendUserMessage(bridge.emptyHistory(), "hello");
    expect(h).toEqual([{ role: "user", content: "hello" }]);
  });

  it("send maps toolCalls to ToolUseRequest with the already-parsed object input", async () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({
        toolCalls: [
          {
            id: "call_1",
            name: "pix_charge_create",
            input: { amountCentavos: 5000 },
          },
        ],
      }),
      model: {},
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

  it("send preserves assistant text content alongside toolCalls", async () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({
        text: "Working on it…",
        toolCalls: [
          {
            id: "call_2",
            name: "list_pix_charges",
            input: {},
          },
        ],
      }),
      model: {},
    });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "sys",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.textBlocks).toEqual(["Working on it…"]);
    expect(turn.toolUses).toHaveLength(1);
  });

  it("appendToolResults fans a list out to role:tool messages", () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({}),
      model: {},
    });
    const h: ReadonlyArray<VercelMessage> = [];
    const next = bridge.appendToolResults(h, [
      { toolUseId: "call_1", content: "ok" },
      { toolUseId: "call_2", content: "Tool failed: …", isError: true },
    ]);
    expect(next).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "",
            output: "ok",
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_2",
            toolName: "",
            output: "Tool failed: …",
          },
        ],
      },
    ]);
  });

  it("appendToolResults uses role 'tool' (not 'user') for every result message", () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({}),
      model: {},
    });
    const next = bridge.appendToolResults([], [
      { toolUseId: "call_1", content: "ok" },
      { toolUseId: "call_2", content: "also ok" },
    ]);
    expect(next).toHaveLength(2);
    for (const msg of next) {
      expect(msg.role).toBe("tool");
    }
  });

  it("send appends the assistant response to history", async () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({ text: "done" }),
      model: {},
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

  it("send passes the system prompt as the dedicated system field, not a message", async () => {
    const generateText = vi.fn(async () => ({ text: "" }));
    const bridge = createVercelBridge({ generateText, model: {} });

    const userOnly = bridge.appendUserMessage(bridge.emptyHistory(), "hi");
    await bridge.send(userOnly, {
      systemPrompt: "you are an assistant",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    const req = generateText.mock.calls[0]?.[0];
    expect(req.system).toBe("you are an assistant");
    expect(req.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("send forwards the output cap as maxOutputTokens", async () => {
    const generateText = vi.fn(async () => ({ text: "" }));
    const bridge = createVercelBridge({ generateText, model: {} });
    await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "s",
      maxTokens: 256,
      toolSchemas: [],
    });
    const req = generateText.mock.calls[0]?.[0];
    expect(req.maxOutputTokens).toBe(256);
  });

  it("maps usage.inputTokens/outputTokens to turn.usage 1:1 (ADR-120)", async () => {
    const generateText = vi.fn(async () => ({
      text: "ok",
      usage: { inputTokens: 11, outputTokens: 22 },
    }));
    const bridge = createVercelBridge({ generateText, model: {} });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "s",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
  });

  it("omits turn.usage when the response has no usage", async () => {
    const bridge = createVercelBridge({
      generateText: fakeGenerateText({ text: "ok" }),
      model: {},
    });
    const { turn } = await bridge.send(bridge.emptyHistory(), {
      systemPrompt: "s",
      maxTokens: 100,
      toolSchemas: [],
    });
    expect(turn.usage).toBeUndefined();
  });
});
