/**
 * `@adjudicate/vercel-ai` — reference Vercel AI SDK integration.
 *
 * Provides:
 *   - `createAdjudicatedAgent` — a thin shim that wires the AI SDK's
 *     `generateText` free function into the provider-neutral loop from
 *     `@adjudicate/adapter-core`.
 *   - `createVercelBridge` — the `ProviderBridge<VercelMessage[]>` impl.
 *     Exposed for advanced adopters that build their own loop on
 *     adapter-core directly.
 *   - `createVercelPromptRenderer` — AI-SDK-tuned system prompt and
 *     dotted → underscored tool-name translation.
 *   - In-memory persistence shims and `createMemoryLedger` — re-exported
 *     from `@adjudicate/adapter-core` for zero-import-friction quickstarts.
 *
 * Adopters pass the AI SDK's `generateText` plus a `LanguageModel` handle
 * (any callable matching `VercelGenerateTextFn` works). The official
 * `generateText` from `ai` satisfies this structurally; mocks for tests
 * do too. There is no hard `ai` / `@ai-sdk/*` dependency.
 *
 * Invariants the underlying loop preserves are documented in
 * `@adjudicate/adapter-core/loop.ts`. Replay determinism, audit
 * integrity, fail-closed semantics, canonical hashing guarantees, the
 * closed Decision enum doctrine — all preserved.
 */

export { createAdjudicatedAgent } from "./adapter.js";
export { createVercelBridge } from "./bridge-vercel.js";
export type { VercelBridgeOptions } from "./bridge-vercel.js";

export {
  createVercelPromptRenderer,
  DEFAULT_VERCEL_ADJUDICATED_SYSTEM_PROMPT,
} from "./renderer-vercel.js";
export type { VercelPromptRendererOptions } from "./renderer-vercel.js";

export type {
  VercelGenerateTextFn,
  VercelGenerateTextRequest,
  VercelGenerateTextResult,
  VercelLanguageModel,
  VercelMessage,
  VercelTool,
  VercelToolCall,
  VercelToolResultPart,
  VercelToolSet,
  VercelUsage,
} from "./vercel-types.js";

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
  PendingConfirmation,
  ResumeAgentArgs,
  Taint,
  ToolResultBlock,
  VercelHistory,
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
