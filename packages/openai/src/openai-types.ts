/**
 * Structural type definitions mirroring the OpenAI Chat Completions API.
 *
 * The package depends on these structural shapes rather than importing
 * the `openai` SDK directly. Three reasons:
 *
 *   1. Adopters drop in any client matching the shape — the official
 *      `openai` SDK, an Azure OpenAI wrapper, a custom mock for tests.
 *   2. The framework does not force a major-version pin on the SDK; the
 *      OpenAI client surface has changed several times in 2024-2026.
 *   3. Test paths can use plain objects without bringing in real network
 *      machinery.
 *
 * The shapes here are a strict subset of `openai@>=4` — adopters using
 * the official SDK can pass `new OpenAI({...})` directly and TypeScript
 * accepts it. If the SDK adds optional fields, this interface stays
 * compatible; if it removes or renames fields we touch, the adapter
 * surfaces a clear type error.
 */

/** Tool description sent to OpenAI. Mirrors `ChatCompletionTool`. */
export interface OpenAITool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description?: string;
    readonly parameters?: Record<string, unknown>;
  };
}

/** A function call the assistant emitted. Mirrors `ChatCompletionMessageToolCall`. */
export interface OpenAIToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    /** Arguments are a JSON-encoded string on the wire. */
    readonly arguments: string;
  };
}

/** Message variants the bridge produces / consumes. */
export type OpenAIMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<OpenAIToolCall>;
    }
  | {
      readonly role: "tool";
      readonly tool_call_id: string;
      readonly content: string;
    };

export interface OpenAIChatCompletionResponse {
  readonly choices: ReadonlyArray<{
    readonly message: {
      readonly role: "assistant";
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<OpenAIToolCall>;
    };
    readonly finish_reason?: string | null;
  }>;
}

export interface OpenAIChatCompletionRequest {
  readonly model: string;
  readonly messages: ReadonlyArray<OpenAIMessage>;
  readonly max_tokens?: number;
  readonly tools?: ReadonlyArray<OpenAITool>;
  readonly tool_choice?: "auto" | "none" | "required" | {
    readonly type: "function";
    readonly function: { readonly name: string };
  };
}

/**
 * Minimal structural interface for the OpenAI client. The official SDK's
 * `OpenAI` instance satisfies this — `client.chat.completions.create(...)`.
 */
export interface OpenAIChatLikeClient {
  readonly chat: {
    readonly completions: {
      create(
        request: OpenAIChatCompletionRequest,
      ): Promise<OpenAIChatCompletionResponse>;
    };
  };
}
