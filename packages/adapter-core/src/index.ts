/**
 * `@adjudicate/adapter-core` — provider-neutral orchestration for
 * adjudicate-backed LLM agents.
 *
 * The loop, bridge, decision translator, persistence shims, and error
 * taxonomy live here. Provider adapters (`@adjudicate/anthropic`,
 * `@adjudicate/openai`, …) implement a `ProviderBridge<H>` against
 * their SDK and re-export a thin `createAdjudicatedAgent` that wires
 * it into this loop.
 *
 * Invariants the loop preserves:
 *   - Every intent envelope crosses `adjudicateAndAudit()`. No bypass,
 *     no taint elevation, no guard-ordering short-circuit.
 *   - First non-continue Decision wins per assistant turn.
 *   - History `H` is opaque to the loop; the bridge owns its shape.
 *   - REWRITE executes the rewritten envelope, never the original.
 *   - DEFER persists full envelope fields so resume can re-derive the
 *     intentHash and detect tampering.
 *
 * Provider adapters MUST NOT bypass this loop. The kernel-side audit
 * + ledger guarantees only hold when every adjudication flows here.
 */

export { createAdjudicatedAgent } from "./loop.js";
export { createQuickAgent } from "./quick-agent.js";
export type { QuickAgentOptions } from "./quick-agent.js";
export type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
  AgentOutcome,
  AgentTurnResult,
  AssistantTurn,
  ConfirmArgs,
  ProviderBridge,
  ProviderRequest,
  ResumeArgs,
  SendInput,
  TokenUsage,
  ToolResultBlock,
  ToolUseRequest,
} from "./types.js";

export {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
  intentKindToApiName,
} from "./bridge.js";
export type {
  BuildEnvelopeFromToolUseArgs,
  ToolUseClassification,
} from "./bridge.js";

export {
  makeOutOfPlanToolResult,
  translateDecision,
} from "./decisions.js";
export type {
  DecisionTranslation,
  DecisionTranslationContext,
  LoopAction,
} from "./decisions.js";

export {
  createInMemoryConfirmationStore,
  createInMemoryDeferStore,
  createInMemoryMemoryStore,
} from "./persistence.js";
export type {
  ConfirmationStore,
  CreateInMemoryMemoryStoreOptions,
  DeferRedis,
  MemoryStore,
  ParkRedis,
  PendingConfirmation,
  VersionedMemory,
} from "./persistence.js";
export {
  createRedisMemoryStore,
  type CreateRedisMemoryStoreOptions,
} from "./persistence-redis.js";
export {
  createRedisConfirmationStore,
  type ConfirmationRedisClient,
  type CreateRedisConfirmationStoreOptions,
} from "./persistence-redis.js";
export {
  createPostgresMemoryStore,
  type CreatePostgresMemoryStoreOptions,
  type MemorySqlExecutor,
} from "./persistence-postgres.js";

export {
  composeFolds,
  composeMetadataProviders,
  type Fold,
  type MetadataProvider,
} from "./fold-hooks.js";

export {
  createInMemoryTokenUsageStore,
  type CreateInMemoryTokenUsageStoreOptions,
  type ExhaustionEventsFilter,
  type SessionConsumption,
  type SessionsFilter,
  type TenantConsumption,
  type TenantsFilter,
  type TokenBudgetConfig,
  type TokenExhaustionEvent,
  type TokenUsageSample,
  type TokenUsageStore,
} from "./token-usage-store.js";

export {
  createRedisTokenUsageStore,
  type CreateRedisTokenUsageStoreOptions,
  type RedisTokenUsageStore,
  type TokenUsageRedisClient,
} from "./token-usage-store-redis.js";

export {
  applyCostTable,
  type CostBreakdown,
  type PriceTable,
} from "./cost.js";

export {
  createInMemoryCatchUsageStore,
  type CatchCounts,
  type CatchSample,
  type CatchUsageStore,
  type CreateInMemoryCatchUsageStoreOptions,
} from "./catch-usage-store.js";

export {
  noopTraceSink,
  createInMemoryTraceSink,
  type AdapterPauseReason,
  type AdapterTraceEvent,
  type AdapterTracePhase,
  type TraceSink,
} from "./trace.js";

export { AdapterError, AdapterErrorCode } from "./errors.js";

/**
 * In-memory Execution Ledger — re-export from `@adjudicate/audit` for
 * zero-import-friction in tests, quickstarts, and local development.
 *
 * NOT for distributed or persistent production deployments. Production
 * adopters wire `createRedisLedger` (or any backing store with SET-NX,
 * EX, INCR, DECR) from `@adjudicate/audit`.
 */
export { createMemoryLedger } from "@adjudicate/audit";
