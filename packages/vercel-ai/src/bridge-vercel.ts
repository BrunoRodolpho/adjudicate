/**
 * `createVercelBridge` — the Vercel AI SDK-side `ProviderBridge`.
 *
 * Maps the AI SDK's `ModelMessage[]` history shape and the
 * `generateText` result shape into the provider-neutral contracts in
 * `@adjudicate/adapter-core`.
 *
 * Notable mappings:
 *   - The AI SDK's `toolCalls[].input` arrives ALREADY PARSED as a
 *     structured object — unlike the OpenAI Chat Completions API where
 *     `arguments` is a JSON-encoded string. The bridge threads it
 *     through unchanged; there is no JSON.parse / `__raw` fallback.
 *   - The AI SDK tool name convention is the record key / `toolName`;
 *     intent kinds containing dots (`pix.charge.create`) flow through
 *     `intentKindToApiName` in the renderer.
 *   - Tool results in the AI SDK are `role: "tool"` messages whose
 *     `content` is an array of `tool-result` parts. The bridge fans out a
 *     `ToolResultBlock[]` into one `role: "tool"` message per result.
 *   - The SDK surface is the FREE FUNCTION `generateText(...)` plus a
 *     `LanguageModel` handle, NOT a stateful client. The bridge injects a
 *     callable + an opaque model handle.
 */

import type {
  AssistantTurn,
  ProviderBridge,
  ProviderRequest,
  ToolResultBlock,
  ToolUseRequest,
} from "@adjudicate/adapter-core";
import type {
  VercelGenerateTextFn,
  VercelLanguageModel,
  VercelMessage,
  VercelToolCall,
  VercelToolResultPart,
  VercelToolSet,
} from "./vercel-types.js";

export interface VercelBridgeOptions {
  /**
   * The AI SDK `generateText` free function (or any callable satisfying
   * `VercelGenerateTextFn`). Request/response only.
   */
  readonly generateText: VercelGenerateTextFn;
  /**
   * Opaque AI SDK model handle, e.g. the result of `openai("gpt-4o")` or
   * `anthropic("claude-...")`. Threaded straight through to `generateText`.
   */
  readonly model: VercelLanguageModel;
}

/**
 * Build a `ProviderBridge<VercelMessage[]>` against the AI SDK
 * `generateText` surface. Threads the SDK's message history through
 * unchanged.
 */
export function createVercelBridge(
  options: VercelBridgeOptions,
): ProviderBridge<ReadonlyArray<VercelMessage>> {
  return {
    emptyHistory() {
      return [];
    },

    appendUserMessage(history, text) {
      return [...history, { role: "user", content: text }];
    },

    async send(history, request: ProviderRequest) {
      // The AI SDK keys tools by name in a record (a `ToolSet`), not an
      // array. Build it from the rendered schemas; the JSON Schema goes
      // under `inputSchema`.
      const tools: VercelToolSet = {};
      for (const s of request.toolSchemas) {
        tools[s.name] = {
          description: s.description,
          inputSchema: s.input_schema,
        };
      }
      const hasTools = Object.keys(tools).length > 0;

      // The AI SDK takes the system prompt as a dedicated `system` field
      // rather than as the first message. Pass it through on every call;
      // the renderer re-derives it from state on each iteration, so any
      // state change is reflected. The output cap is `maxOutputTokens`
      // (the v5 name, replacing v3/v4 `maxTokens`).
      const result = await options.generateText({
        model: options.model,
        system: request.systemPrompt,
        maxOutputTokens: request.maxTokens,
        messages: history,
        ...(hasTools ? { tools } : {}),
      });

      const textBlocks: string[] = [];
      if (typeof result.text === "string" && result.text.length > 0) {
        textBlocks.push(result.text);
      }

      // The AI SDK delivers `toolCalls[].input` already parsed as a
      // structured object — no JSON string to decode. Thread it through.
      const toolCalls: ReadonlyArray<VercelToolCall> = result.toolCalls ?? [];
      const toolUses: ToolUseRequest[] = toolCalls.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        input: tc.input,
      }));

      // Map provider token usage (ADR-120): AI SDK v5 reports
      // `usage.{inputTokens,outputTokens}` — a 1:1 match for
      // adapter-core's `TokenUsage`, so map straight through; absent → omit.
      const usage =
        result.usage !== undefined
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            }
          : undefined;
      const turn: AssistantTurn = usage
        ? { textBlocks, toolUses, usage }
        : { textBlocks, toolUses };
      const assistantMessage: VercelMessage = {
        role: "assistant",
        content: result.text ?? "",
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
      const newHistory: ReadonlyArray<VercelMessage> = [
        ...history,
        assistantMessage,
      ];
      return { history: newHistory, turn };
    },

    appendToolResults(history, results: ReadonlyArray<ToolResultBlock>) {
      // The AI SDK uses `role: "tool"` messages (NOT Anthropic's
      // `role: "user"`); each carries an array of `tool-result` parts.
      // Fan each block out to its own `role: "tool"` message.
      const blocks: VercelMessage[] = results.map((r) => {
        const part: VercelToolResultPart = {
          type: "tool-result",
          toolCallId: r.toolUseId,
          // The provider-neutral ToolResultBlock carries only `toolUseId`, not
          // the tool name. The AI SDK correlates a result to its call by
          // `toolCallId` (set above), so `toolName` is redundant for matching —
          // we emit an empty sentinel rather than fabricate a name. Carrying the
          // real name would require widening ToolResultBlock across adapter-core
          // and every bridge; tracked as a separate change. The AI SDK also has
          // no per-result is_error flag in this subset — the loop already
          // prefixes failed-tool content with "Tool failed: …", so the model
          // still sees the failure semantics.
          toolName: "",
          output: r.content,
        };
        return { role: "tool", content: [part] };
      });
      return [...history, ...blocks];
    },
  };
}
