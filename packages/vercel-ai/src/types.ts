/**
 * Public types for `@adjudicate/vercel-ai`.
 *
 * Mirrors the OpenAI adapter's public surface but threads
 * `ReadonlyArray<VercelMessage>` as the history shape, and injects the AI
 * SDK's `generateText` free function plus an opaque model handle rather
 * than a stateful client. Most type machinery is re-exported from
 * `@adjudicate/adapter-core`.
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
  VercelGenerateTextFn,
  VercelLanguageModel,
  VercelMessage,
} from "./vercel-types.js";

/** AI-SDK-typed conversation history. Opaque to the kernel. */
export type VercelHistory = ReadonlyArray<VercelMessage>;

export type ConfirmationStore = ConfirmationStoreCore<VercelHistory>;
export type PendingConfirmation = PendingConfirmationCore<VercelHistory>;

export type { AdopterExecutor, AgentLogger };

export interface AdjudicatedAgentOptions<K extends string, P, S, C>
  // Forward the provider-neutral agent-loop seams verbatim from adapter-core so
  // they can never structurally drift: token-usage telemetry (ADR-120),
  // cross-session memory (ADR-126), the config-integrity gate (ADR-121), and the
  // trace sink. Without these declared+forwarded, those features were
  // unreachable through this provider bridge.
  extends Pick<
    AdjudicatedAgentOptionsCore<K, P, S, C, VercelHistory>,
    | "onTokenUsage"
    | "memoryStore"
    | "enrichContext"
    | "deriveMemoryWriteback"
    | "configSeal"
    | "traceSink"
  > {
  readonly pack: PackV0<K, P, S, C>;
  /**
   * The AI SDK `generateText` free function (or any callable satisfying
   * `VercelGenerateTextFn`).
   */
  readonly generateText: VercelGenerateTextFn;
  /**
   * Opaque AI SDK model handle, e.g. `openai("gpt-4o")` or
   * `anthropic("claude-...")`.
   */
  readonly model: VercelLanguageModel;
  /** Max output tokens per turn. */
  readonly maxTokens: number;
  /** Renderer override; defaults to `createVercelPromptRenderer`. */
  readonly renderer: PromptRenderer<S, C>;
  readonly deferStore: DeferRedis & ParkRedis;
  readonly confirmationStore: ConfirmationStore;
  readonly auditSink?: AuditSink;
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
  extends Omit<SendInputCore<S, C, VercelHistory>, "history"> {
  readonly history?: VercelHistory;
}

export interface ResumeAgentArgs<S, C>
  extends Omit<ResumeArgsCore<S, C, VercelHistory>, "history"> {
  readonly history?: VercelHistory;
}

export type ConfirmAgentArgs<S, C> = ConfirmArgsCore<S, C>;

export type { AgentEvent, AgentOutcome };

export type AgentTurnResult = AgentTurnResultCore<VercelHistory>;

export type AdjudicatedAgent<_K extends string, _P, S, C> = AdjudicatedAgentCore<
  _K,
  _P,
  S,
  C,
  VercelHistory
>;

export type { ToolResultBlock };
export type { Taint };
export type { Decision, IntentEnvelope };
