/**
 * `@adjudicate/anthropic` — reference Anthropic Messages API integration.
 *
 * Provides:
 *   - `createAdjudicatedAgent` — a thin shim that wires the Anthropic SDK
 *     into the provider-neutral loop from `@adjudicate/adapter-core`.
 *   - `createAnthropicBridge` — the `ProviderBridge<MessageParam[]>`
 *     implementation against the Anthropic SDK. Exposed for advanced
 *     adopters that build their own loop on adapter-core directly.
 *   - `createAnthropicPromptRenderer` — Anthropic-tuned system prompt +
 *     tool-name translation.
 *   - Persistence shims and error / event types — re-exported from
 *     `@adjudicate/adapter-core` so adopter imports stay stable across
 *     the v0.5 → v0.6 split.
 *
 * Everything load-bearing — tool-use loop, defer/confirm orchestration,
 * audit + ledger wiring, REWRITE handling, confirmation-blob hash
 * verification — lives in `@adjudicate/adapter-core`.
 */

export { createAdjudicatedAgent } from "./adapter.js";
export {
  createAnthropicBridge,
  type AnthropicBridgeOptions,
} from "./bridge-anthropic.js";

export type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AdjudicatedAgentSendInput,
  AdapterContext,
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
  AgentOutcome,
  AgentTurnResult,
  AnthropicHistory,
  ConfirmAgentArgs,
  ConfirmationStore,
  PendingConfirmation,
  ResumeAgentArgs,
  Taint,
  ToolResultBlock,
} from "./types.js";

export {
  createAnthropicPromptRenderer,
  DEFAULT_ADJUDICATED_SYSTEM_PROMPT,
} from "./renderer-anthropic.js";
export type { AnthropicPromptRendererOptions } from "./renderer-anthropic.js";

// ── Re-exports from adapter-core (preserve adopter import paths) ─────────────

export {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
  intentKindToApiName,
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createMemoryLedger,
  translateDecision,
  AdapterError,
  AdapterErrorCode,
} from "@adjudicate/adapter-core";

export type {
  DeferRedis,
  ParkRedis,
  DecisionTranslation,
  DecisionTranslationContext,
  ToolUseClassification,
} from "@adjudicate/adapter-core";

// ── Back-compat aliases (alias removed-in-v0.6 names to canonical ones) ─────

import {
  AdapterError as AdapterErrorImpl,
  AdapterErrorCode as AdapterErrorCodeImpl,
} from "@adjudicate/adapter-core";

/**
 * @deprecated since v0.6 — use {@link AdapterError} from
 * `@adjudicate/adapter-core` (re-exported above). Removed in v2.0.
 */
export const AnthropicAdapterError = AdapterErrorImpl;
/**
 * @deprecated since v0.6 — use {@link AdapterErrorCode} from
 * `@adjudicate/adapter-core` (re-exported above). Removed in v2.0.
 */
export const AnthropicAdapterErrorCode = AdapterErrorCodeImpl;
export type AnthropicAdapterError = AdapterErrorImpl;
export type AnthropicAdapterErrorCode = AdapterErrorCodeImpl;
