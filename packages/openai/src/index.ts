/**
 * `@adjudicate/openai` — reference OpenAI Chat Completions integration.
 *
 * Provides:
 *   - `createAdjudicatedAgent` — a thin shim that wires an OpenAI-shaped
 *     client into the provider-neutral loop from `@adjudicate/adapter-core`.
 *   - `createOpenAIBridge` — the `ProviderBridge<OpenAIMessage[]>` impl.
 *     Exposed for advanced adopters that build their own loop on
 *     adapter-core directly.
 *   - `createOpenAIPromptRenderer` — OpenAI-tuned system prompt and
 *     dotted → underscored tool-name translation.
 *   - In-memory persistence shims and `createMemoryLedger` — re-exported
 *     from `@adjudicate/adapter-core` for zero-import-friction quickstarts.
 *
 * Adopters pass any object matching `OpenAIChatLikeClient`. The official
 * `openai` SDK's `OpenAI` client satisfies this structurally; mocks for
 * tests do too.
 *
 * Invariants the underlying loop preserves are documented in
 * `@adjudicate/adapter-core/loop.ts`. Replay determinism, audit
 * integrity, fail-closed semantics, canonical hashing guarantees, the
 * closed Decision enum doctrine — all preserved.
 */

export { createAdjudicatedAgent } from "./adapter.js";
export { createOpenAIBridge } from "./bridge-openai.js";
export type { OpenAIBridgeOptions } from "./bridge-openai.js";

export {
  createOpenAIPromptRenderer,
  DEFAULT_OPENAI_ADJUDICATED_SYSTEM_PROMPT,
} from "./renderer-openai.js";
export type { OpenAIPromptRendererOptions } from "./renderer-openai.js";

export type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIChatLikeClient,
  OpenAIMessage,
  OpenAITool,
  OpenAIToolCall,
} from "./openai-types.js";

export type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AdjudicatedAgentSendInput,
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
  AgentOutcome,
  AgentTurnResult,
  ConfirmAgentArgs,
  ConfirmationStore,
  OpenAIHistory,
  PendingConfirmation,
  ResumeAgentArgs,
  Taint,
  ToolResultBlock,
} from "./types.js";

// ── Re-exports from adapter-core (preserve quickstart import paths) ──────────

export {
  AdapterError,
  AdapterErrorCode,
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  intentKindToApiName,
} from "@adjudicate/adapter-core";

export type {
  DeferRedis,
  ParkRedis,
  ToolUseClassification,
} from "@adjudicate/adapter-core";
