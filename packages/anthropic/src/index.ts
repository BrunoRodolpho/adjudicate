/**
 * `@adjudicate/anthropic` — reference Anthropic Messages API integration.
 *
 * The adapter sits *before* `adjudicate()` from `@adjudicate/core/kernel`,
 * shaping prompts and bridging the LLM's tool_use blocks to typed
 * `IntentEnvelope`s. The kernel still adjudicates every proposed mutation;
 * the adapter never bypasses or short-circuits it.
 *
 * See the package README for the L2 rework callouts — surfaces likely to
 * shift when the policy-primitives layer extracts.
 */

export { createAdjudicatedAgent } from "./adapter.js";
export type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AdjudicatedAgentSendInput,
  AgentEvent,
  AgentOutcome,
  AgentTurnResult,
  AdapterContext,
  AdopterExecutor,
  AgentLogger,
  ConfirmAgentArgs,
  ResumeAgentArgs,
} from "./types.js";

export {
  createAnthropicPromptRenderer,
  DEFAULT_ADJUDICATED_SYSTEM_PROMPT,
} from "./renderer-anthropic.js";
export type { AnthropicPromptRendererOptions } from "./renderer-anthropic.js";

export {
  createInMemoryDeferStore,
  createInMemoryConfirmationStore,
} from "./persistence.js";
export type {
  ConfirmationStore,
  DeferRedis,
  ParkRedis,
  PendingConfirmation,
} from "./persistence.js";

export {
  classifyIncomingToolUse,
  buildEnvelopeFromToolUse,
} from "./bridge.js";
export type { ToolUseClassification } from "./bridge.js";

export { translateDecision } from "./decisions.js";
export type {
  DecisionTranslation,
  DecisionTranslationContext,
} from "./decisions.js";

export {
  AnthropicAdapterError,
  AnthropicAdapterErrorCode,
} from "./errors.js";
