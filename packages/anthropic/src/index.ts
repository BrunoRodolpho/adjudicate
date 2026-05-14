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

/**
 * In-memory Execution Ledger — re-export from `@adjudicate/audit` for
 * zero-import-friction in tests, the quickstart, and local development.
 *
 * `createMemoryLedger()` provides replay suppression only within a single
 * process lifetime and MUST NOT be used for distributed or persistent
 * production deployments. Production adopters wire `createRedisLedger`
 * (or any backing store with SET-NX, EX, INCR, DECR) from
 * `@adjudicate/audit`.
 */
export { createMemoryLedger } from "@adjudicate/audit";
