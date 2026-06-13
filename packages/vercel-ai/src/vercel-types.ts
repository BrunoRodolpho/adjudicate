/**
 * Structural type definitions mirroring the Vercel AI SDK v5+ surface.
 *
 * The package depends on these structural shapes rather than importing
 * the `ai` / `@ai-sdk/*` packages directly. Three reasons:
 *
 *   1. Adopters drop in any callable matching the shape — the official
 *      `generateText` from `ai`, a custom wrapper, a mock for tests.
 *   2. The framework does not force a major-version pin on the SDK; the
 *      AI SDK surface has changed several times across v3/v4/v5.
 *   3. Test paths can use plain functions without bringing in real
 *      network machinery or a provider package.
 *
 * The shapes here are a strict subset of `ai@>=5` — adopters using the
 * official SDK can pass `generateText` plus a `LanguageModel` directly
 * and TypeScript accepts it. If the SDK adds optional fields, this
 * interface stays compatible; if it removes or renames fields we touch,
 * the adapter surfaces a clear type error.
 *
 * Unlike the Chat Completions API, the AI SDK exposes a FREE FUNCTION
 * `generateText(...)` plus an opaque `LanguageModel` instance rather than
 * a stateful client object. The bridge therefore injects a callable plus
 * a model handle instead of a client.
 */

/**
 * Opaque AI SDK model handle. A `LanguageModel` instance (the result of
 * e.g. `openai("gpt-4o")` or `anthropic("claude-...")`) satisfies this.
 * The adapter never inspects it — it is threaded straight through to
 * `generateText`.
 */
export type VercelLanguageModel = unknown;

/**
 * Tool description sent to `generateText`. The AI SDK keys tools by name
 * in a record (not an array) and carries the JSON Schema under
 * `inputSchema`. Mirrors the SDK's `ToolSet` entry shape (the subset the
 * adapter populates).
 */
export interface VercelTool {
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

/** A tool set keyed by tool name. Mirrors the SDK's `ToolSet`. */
export type VercelToolSet = Record<string, VercelTool>;

/**
 * A tool call the assistant emitted. Mirrors the SDK v5
 * `ToolCallPart` / `generateText` `toolCalls[]` entry — `input` arrives
 * already parsed as a structured object (NOT a JSON string).
 */
export interface VercelToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  /** Arguments arrive already parsed as a structured object. */
  readonly input: unknown;
}

/**
 * A tool-result part returned to the model. Mirrors the SDK v5
 * `ToolResultPart`. The result payload travels under `output`.
 */
export interface VercelToolResultPart {
  readonly type: "tool-result";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
}

/** Message variants the bridge produces / consumes. Mirrors `ModelMessage`. */
export type VercelMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string;
      readonly toolCalls?: ReadonlyArray<VercelToolCall>;
    }
  | {
      readonly role: "tool";
      readonly content: ReadonlyArray<VercelToolResultPart>;
    };

/**
 * Token usage (ADR-120) as reported by AI SDK v5. The SDK names the
 * fields `inputTokens` / `outputTokens` — a 1:1 match for adapter-core's
 * `TokenUsage`, so no rename is needed at the bridge.
 */
export interface VercelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/**
 * The result returned by `generateText`. Mirrors the subset of the SDK's
 * `GenerateTextResult` the bridge reads.
 */
export interface VercelGenerateTextResult {
  readonly text: string;
  readonly toolCalls?: ReadonlyArray<VercelToolCall>;
  /** Token usage. Optional — present on real AI SDK responses. */
  readonly usage?: VercelUsage;
}

/**
 * The request passed to `generateText`. Mirrors the subset of the SDK's
 * `generateText` options the bridge populates. Note `maxOutputTokens`
 * (the v5 name for the output cap, replacing v3/v4 `maxTokens`).
 */
export interface VercelGenerateTextRequest {
  readonly model: VercelLanguageModel;
  readonly system?: string;
  readonly messages: ReadonlyArray<VercelMessage>;
  readonly maxOutputTokens?: number;
  readonly tools?: VercelToolSet;
}

/**
 * Structural signature of the AI SDK's `generateText` free function. The
 * official `generateText` from `ai` satisfies this; mocks for tests do
 * too. Request/response only — `streamText` is deliberately out of scope
 * (`ProviderBridge.send` is not a streaming contract).
 */
export type VercelGenerateTextFn = (
  request: VercelGenerateTextRequest,
) => Promise<VercelGenerateTextResult>;
