/**
 * ADR-120 — the Anthropic bridge maps Message.usage onto AssistantTurn.usage.
 */
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { createAnthropicBridge } from "../src/bridge-anthropic.js";

function clientReturning(message: Partial<Message>): Anthropic {
  const create = vi.fn(async () => ({
    id: "m",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "ok", citations: null }],
    model: "test",
    stop_reason: "end_turn",
    stop_sequence: null,
    ...message,
  }));
  return { messages: { create } } as unknown as Anthropic;
}

const req = { systemPrompt: "s", maxTokens: 100, toolSchemas: [] };

describe("anthropic bridge token usage (ADR-120)", () => {
  it("maps input_tokens/output_tokens to turn.usage", async () => {
    const bridge = createAnthropicBridge({
      client: clientReturning({ usage: { input_tokens: 7, output_tokens: 9 } as Message["usage"] }),
      model: "claude-test",
    });
    const { turn } = await bridge.send([], req);
    expect(turn.usage).toEqual({ inputTokens: 7, outputTokens: 9 });
  });

  it("omits turn.usage when the response carries no usage", async () => {
    const bridge = createAnthropicBridge({
      client: clientReturning({ usage: undefined }),
      model: "claude-test",
    });
    const { turn } = await bridge.send([], req);
    expect(turn.usage).toBeUndefined();
  });
});
