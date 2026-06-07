/**
 * `createOpenAIBridge` — the OpenAI-side `ProviderBridge`.
 *
 * Maps the OpenAI Chat Completions API's `ChatCompletionMessageParam[]`
 * history shape and `ChatCompletion` response shape into the
 * provider-neutral contracts in `@adjudicate/adapter-core`.
 *
 * Notable mappings:
 *   - OpenAI's `tool_calls[].function.arguments` is a JSON-encoded
 *     string; the bridge `JSON.parse()`s it into a structured payload
 *     before handing it to the loop.
 *   - The OpenAI tool name convention is `function.name`; intent kinds
 *     containing dots (`pix.charge.create`) flow through
 *     `intentKindToApiName` in the renderer.
 *   - Tool results in OpenAI are individual messages with
 *     `role: "tool", tool_call_id, content`. The bridge fans out a
 *     `ToolResultBlock[]` into multiple `role: "tool"` messages.
 */

import type {
  AssistantTurn,
  ProviderBridge,
  ProviderRequest,
  ToolResultBlock,
  ToolUseRequest,
} from "@adjudicate/adapter-core";
import type {
  OpenAIChatLikeClient,
  OpenAIMessage,
  OpenAITool,
  OpenAIToolCall,
} from "./openai-types.js";

export interface OpenAIBridgeOptions {
  /** OpenAI SDK client (or any object satisfying `OpenAIChatLikeClient`). */
  readonly client: OpenAIChatLikeClient;
  /** Model id. e.g. `"gpt-4o"`, `"gpt-4-turbo"`. */
  readonly model: string;
}

/**
 * Build a `ProviderBridge<OpenAIMessage[]>` against the OpenAI Chat
 * Completions API. Threads the SDK's message history through unchanged.
 */
export function createOpenAIBridge(
  options: OpenAIBridgeOptions,
): ProviderBridge<ReadonlyArray<OpenAIMessage>> {
  return {
    emptyHistory() {
      return [];
    },

    appendUserMessage(history, text) {
      return [...history, { role: "user", content: text }];
    },

    async send(history, request: ProviderRequest) {
      const tools: OpenAITool[] = request.toolSchemas.map((s) => ({
        type: "function",
        function: {
          name: s.name,
          description: s.description,
          parameters: s.input_schema,
        },
      }));

      // OpenAI requires the system prompt as the first message in the
      // `messages` array. Splice it in without persisting it to the
      // adopter-visible history (which already starts with the user
      // message). On every call we prepend the current rendered prompt
      // — the renderer re-derives it from state on each iteration, so
      // any state change is reflected.
      const systemMessage: OpenAIMessage = {
        role: "system",
        content: request.systemPrompt,
      };

      const resp = await options.client.chat.completions.create({
        model: options.model,
        max_tokens: request.maxTokens,
        messages: [systemMessage, ...history],
        ...(tools.length > 0 ? { tools } : {}),
      });

      const message = resp.choices[0]?.message;
      if (message === undefined) {
        throw new Error(
          "[adjudicate/openai] OpenAI response had no choices[0].message — refusing to continue",
        );
      }

      const textBlocks: string[] = [];
      if (typeof message.content === "string" && message.content.length > 0) {
        textBlocks.push(message.content);
      }

      const toolUses: ToolUseRequest[] = (message.tool_calls ?? []).map(
        (tc: OpenAIToolCall) => {
          let parsedInput: unknown = {};
          try {
            parsedInput =
              tc.function.arguments.length > 0
                ? JSON.parse(tc.function.arguments)
                : {};
          } catch {
            // Malformed JSON from the model is recoverable — surface as
            // a string payload so the bridge classifier still routes it
            // to the right tool name. The kernel's schema guard
            // (state-phase) will refuse it with a clear basis if the
            // payload doesn't match the intent contract.
            parsedInput = { __raw: tc.function.arguments };
          }
          return {
            id: tc.id,
            name: tc.function.name,
            input: parsedInput,
          };
        },
      );

      // Map provider token usage (ADR-120): OpenAI reports
      // `usage.{prompt_tokens,completion_tokens}`; absent → omit.
      const usage =
        resp.usage !== undefined
          ? {
              inputTokens: resp.usage.prompt_tokens,
              outputTokens: resp.usage.completion_tokens,
            }
          : undefined;
      const turn: AssistantTurn = usage
        ? { textBlocks, toolUses, usage }
        : { textBlocks, toolUses };
      const assistantMessage: OpenAIMessage = {
        role: "assistant",
        content: message.content ?? null,
        ...(message.tool_calls && message.tool_calls.length > 0
          ? { tool_calls: message.tool_calls }
          : {}),
      };
      const newHistory: ReadonlyArray<OpenAIMessage> = [
        ...history,
        assistantMessage,
      ];
      return { history: newHistory, turn };
    },

    appendToolResults(history, results: ReadonlyArray<ToolResultBlock>) {
      const blocks: OpenAIMessage[] = results.map((r) => ({
        role: "tool",
        tool_call_id: r.toolUseId,
        // OpenAI does not have a per-message is_error flag; the loop
        // already prefixes error content with "Tool failed: …" / similar
        // so the model still sees the failure semantics.
        content: r.content,
      }));
      return [...history, ...blocks];
    },
  };
}
