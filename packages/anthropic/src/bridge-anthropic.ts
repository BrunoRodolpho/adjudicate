/**
 * `createAnthropicBridge` — the Anthropic-side `ProviderBridge`.
 *
 * Maps the Anthropic SDK's `MessageParam[]` history shape and `Message`
 * response shape into the provider-neutral contracts in
 * `@adjudicate/adapter-core`. The loop never inspects the history; this
 * bridge is the only thing in the codebase that knows about Anthropic's
 * `tool_use` / `tool_result` block layout for the Anthropic provider.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AssistantTurn,
  ProviderBridge,
  ProviderRequest,
  ToolResultBlock,
  ToolUseRequest,
} from "@adjudicate/adapter-core";

export interface AnthropicBridgeOptions {
  /** Constructed Anthropic SDK client. Adopter owns auth, baseURL, retries. */
  readonly client: Anthropic;
  /** Model id. e.g. `"claude-opus-4-7"`. */
  readonly model: string;
}

/**
 * Build a `ProviderBridge<MessageParam[]>` against the Anthropic SDK. The
 * bridge appends user messages, assistant turns, and tool-result blocks
 * in the SDK's native shape.
 */
export function createAnthropicBridge(
  options: AnthropicBridgeOptions,
): ProviderBridge<ReadonlyArray<MessageParam>> {
  return {
    emptyHistory() {
      return [];
    },

    appendUserMessage(history, text) {
      return [...history, { role: "user", content: text }];
    },

    async send(history, request: ProviderRequest) {
      const tools: Tool[] = request.toolSchemas.map((s) => ({
        name: s.name,
        description: s.description,
        input_schema: s.input_schema as Tool["input_schema"],
      }));

      const resp: Message = await options.client.messages.create({
        model: options.model,
        max_tokens: request.maxTokens,
        system: request.systemPrompt,
        tools,
        messages: history as MessageParam[],
      });

      const textBlocks = resp.content
        .filter(
          (b: ContentBlock): b is Extract<ContentBlock, { type: "text" }> =>
            b.type === "text",
        )
        .map((b) => b.text);

      const toolUses: ToolUseRequest[] = resp.content
        .filter((b: ContentBlock): b is ToolUseBlock => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        }));

      const turn: AssistantTurn = { textBlocks, toolUses };
      const newHistory: ReadonlyArray<MessageParam> = [
        ...history,
        { role: "assistant", content: resp.content },
      ];
      return { history: newHistory, turn };
    },

    appendToolResults(
      history,
      results: ReadonlyArray<ToolResultBlock>,
    ) {
      const blocks: ToolResultBlockParam[] = results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      }));
      return [...history, { role: "user", content: blocks }];
    },
  };
}
