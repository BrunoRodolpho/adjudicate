/**
 * Public types for `@adjudicate/openai`.
 *
 * Mirrors the Anthropic adapter's public surface but threads
 * `ReadonlyArray<OpenAIMessage>` as the history shape. Most type
 * machinery is re-exported from `@adjudicate/adapter-core`.
 */

import type {
  AdjudicatedAgent as AdjudicatedAgentCore,
  AdjudicatedAgentOptions as AdjudicatedAgentOptionsCore,
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
  AgentOutcome,
  AgentTurnResult as AgentTurnResultCore,
  ConfirmArgs as ConfirmArgsCore,
  ResumeArgs as ResumeArgsCore,
  SendInput as SendInputCore,
  ToolResultBlock,
} from "@adjudicate/adapter-core";
import type {
  ConfirmationStore as ConfirmationStoreCore,
  DeferRedis,
  ParkRedis,
  PendingConfirmation as PendingConfirmationCore,
} from "@adjudicate/adapter-core";
import type { PromptRenderer } from "@adjudicate/core/llm";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type {
  AuditSink,
  Decision,
  IntentEnvelope,
  Ledger,
  PackV0,
  Taint,
} from "@adjudicate/core";
import type {
  OpenAIChatLikeClient,
  OpenAIMessage,
} from "./openai-types.js";

/** OpenAI-typed conversation history. Opaque to the kernel. */
export type OpenAIHistory = ReadonlyArray<OpenAIMessage>;

export type ConfirmationStore = ConfirmationStoreCore<OpenAIHistory>;
export type PendingConfirmation = PendingConfirmationCore<OpenAIHistory>;

export type { AdopterExecutor, AgentLogger };

export interface AdjudicatedAgentOptions<K extends string, P, S, C>
  // Forward the provider-neutral agent-loop seams verbatim from adapter-core so
  // they can never structurally drift: token-usage telemetry (ADR-120),
  // cross-session memory (ADR-126), the config-integrity gate (ADR-121), and the
  // trace sink. Without these declared+forwarded, those features were
  // unreachable through this provider bridge.
  extends Pick<
    AdjudicatedAgentOptionsCore<K, P, S, C, OpenAIHistory>,
    | "onTokenUsage"
    | "memoryStore"
    | "enrichContext"
    | "deriveMemoryWriteback"
    | "configSeal"
    | "traceSink"
  > {
  readonly pack: PackV0<K, P, S, C>;
  /** OpenAI SDK client (or any object satisfying `OpenAIChatLikeClient`). */
  readonly openaiClient: OpenAIChatLikeClient;
  /** Model id. e.g. `"gpt-4o"`. */
  readonly model: string;
  /** Max output tokens per turn. */
  readonly maxTokens: number;
  /** Renderer override; defaults to `createOpenAIPromptRenderer`. */
  readonly renderer: PromptRenderer<S, C>;
  readonly deferStore: DeferRedis & ParkRedis;
  readonly confirmationStore: ConfirmationStore;
  /**
   * AuditSink — REQUIRED (013/T1): mirrors the now-required `adapter-core` dep;
   * no fail-open `noopAuditSink()` default (invariant #6). Wire a durable sink,
   * or an explicit `noopAuditSink()` to opt out visibly.
   */
  readonly auditSink: AuditSink;
  /** Execution Ledger — REQUIRED for replay suppression. */
  readonly ledger: Ledger;
  readonly runtimeContext?: RuntimeContext;
  readonly maxIterations?: number;
  readonly executor: AdopterExecutor<K, P, S>;
  readonly rk?: (raw: string) => string;
  readonly deriveNonce?: (args: {
    sessionId: string;
    toolUseId: string;
    payload: unknown;
  }) => string;
  readonly log?: AgentLogger;
  readonly verifyParkedHash?: "strict" | "warn" | "off";
}

export interface AdjudicatedAgentSendInput<S, C>
  extends Omit<SendInputCore<S, C, OpenAIHistory>, "history"> {
  readonly history?: OpenAIHistory;
}

export interface ResumeAgentArgs<S, C>
  extends Omit<ResumeArgsCore<S, C, OpenAIHistory>, "history"> {
  readonly history?: OpenAIHistory;
}

export type ConfirmAgentArgs<S, C> = ConfirmArgsCore<S, C>;

export type { AgentEvent, AgentOutcome };

export type AgentTurnResult = AgentTurnResultCore<OpenAIHistory>;

export type AdjudicatedAgent<_K extends string, _P, S, C> = AdjudicatedAgentCore<
  _K,
  _P,
  S,
  C,
  OpenAIHistory
>;

export type { ToolResultBlock };
export type { Taint };
export type { Decision, IntentEnvelope };
