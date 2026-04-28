/**
 * Public types for `@adjudicate/anthropic`.
 *
 * The agent owns the Anthropic Messages API loop. Adopters supply the Pack,
 * the Anthropic client, persistence shims, and (for EXECUTE outcomes) an
 * executor that runs the real side-effects.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AuditSink,
  Decision,
  IntentEnvelope,
  Taint,
} from "@adjudicate/core";
import type { PackV0 } from "@adjudicate/core";
import type { PromptRenderer } from "@adjudicate/core/llm";
import type { DeferRedis, ParkRedis } from "./persistence.js";
import type { ConfirmationStore } from "./persistence.js";

/**
 * Adopter-supplied side-effect runner. Called only after the kernel
 * returns EXECUTE (or REWRITE — the executor receives the rewritten
 * envelope, NOT the original).
 *
 * READ tools that the LLM proposes go through `invokeRead`; intent
 * executions that the kernel authorized go through `invokeIntent`.
 */
export interface AdopterExecutor<K extends string, P, S> {
  /** Run a READ tool the planner advertised. Result is JSON-serialized into the tool_result. */
  invokeRead(
    name: string,
    input: unknown,
    state: S,
  ): Promise<unknown>;
  /**
   * Run an authorized intent. Returns whatever should be JSON-serialized
   * into the tool_result content surfaced back to the LLM. Throwing here
   * surfaces as `is_error: true` tool_result via `EXECUTOR_FAILED`.
   */
  invokeIntent(
    envelope: IntentEnvelope<K, P>,
    state: S,
  ): Promise<unknown>;
}

/** Per-tool_use logger hook. Best-effort; absence of methods is allowed. */
export interface AgentLogger {
  info?: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  debug?: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Adopter context that flows into the planner and renderer. Opaque to the
 * adapter — the Pack determines what shape it expects.
 */
export type AdapterContext = unknown;

export interface AdjudicatedAgentOptions<K extends string, P, S, C> {
  /**
   * Pack the agent adjudicates against. MUST already be the output of
   * `installPack(...)` or `withBasisAudit(...)`. The adapter does NOT
   * double-wrap — Pack-author convention applies.
   */
  readonly pack: PackV0<K, P, S, C>;
  /** Constructed Anthropic SDK client. Adopter owns auth, baseURL, retries. */
  readonly anthropicClient: Anthropic;
  /** Model id. e.g. `"claude-opus-4-7"`. */
  readonly model: string;
  /** Max output tokens per turn. */
  readonly maxTokens: number;
  /** Optional renderer override. Defaults to `createAnthropicPromptRenderer({ packId })`. */
  readonly renderer: PromptRenderer<S, C>;
  /** Persistence for DEFER. In-memory shim provided. Combined park + resume Redis surface. */
  readonly deferStore: DeferRedis & ParkRedis;
  /** Persistence for REQUEST_CONFIRMATION pauses. In-memory shim provided. */
  readonly confirmationStore: ConfirmationStore;
  /** Optional AuditSink — emits one record per Decision. */
  readonly auditSink?: AuditSink;
  /** Hard cap on assistant↔tool ping-pong per .send() call. Defaults to 8. */
  readonly maxIterations?: number;
  /** Adopter-owned executor. Required. */
  readonly executor: AdopterExecutor<K, P, S>;
  /** `rk()` namespacer for the deferStore. Defaults to identity. */
  readonly rk?: (raw: string) => string;
  /**
   * Override the nonce used when constructing IntentEnvelopes from
   * tool_use blocks. Default: `tool_use.id` (Anthropic's stable id —
   * gives natural retry idempotency).
   */
  readonly deriveNonce?: (args: {
    sessionId: string;
    toolUseId: string;
    payload: unknown;
  }) => string;
  /** Optional logger. */
  readonly log?: AgentLogger;
}

export interface AdjudicatedAgentSendInput<S, C> {
  readonly sessionId: string;
  readonly userMessage: string;
  readonly state: S;
  readonly context: C;
  /** Conversation history. Adopter persists across calls. */
  readonly history?: ReadonlyArray<MessageParam>;
}

export interface ResumeAgentArgs<S, C> {
  readonly sessionId: string;
  readonly signal: string;
  readonly state: S;
  readonly context: C;
  readonly history?: ReadonlyArray<MessageParam>;
}

export interface ConfirmAgentArgs<S, C> {
  readonly confirmationToken: string;
  readonly accepted: boolean;
  readonly state: S;
  readonly context: C;
}

export type AgentOutcome =
  | { kind: "completed"; assistantText: string }
  | { kind: "deferred"; signal: string; intentHash: string }
  | {
      kind: "awaiting_confirmation";
      prompt: string;
      confirmationToken: string;
    }
  | { kind: "escalated"; to: "human" | "supervisor"; reason: string }
  | { kind: "max_iterations_exceeded"; lastDecision: Decision | null };

export interface AgentTurnResult {
  readonly events: ReadonlyArray<AgentEvent>;
  readonly history: ReadonlyArray<MessageParam>;
  readonly outcome: AgentOutcome;
}

export type AgentEvent =
  | { kind: "user_message"; text: string }
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_use"; toolUseId: string; toolName: string; input: unknown }
  | { kind: "intent_proposed"; envelope: IntentEnvelope }
  | { kind: "decision"; decision: Decision; envelope: IntentEnvelope }
  | { kind: "handler_result"; toolUseId: string; result: unknown }
  | {
      kind: "tool_result";
      toolUseId: string;
      payload: ToolResultBlockParam;
    };

export interface AdjudicatedAgent<K extends string, P, S, C> {
  /** One user message + (state, context) snapshot → resolved turn. */
  send(input: AdjudicatedAgentSendInput<S, C>): Promise<AgentTurnResult>;
  /** Resume a parked DEFER (typically from an adopter's webhook handler). */
  resume(args: ResumeAgentArgs<S, C>): Promise<AgentTurnResult>;
  /** Resume a REQUEST_CONFIRMATION with a yes/no from the user. */
  confirm(args: ConfirmAgentArgs<S, C>): Promise<AgentTurnResult>;
}

/** Re-export for adopters who want to construct their own envelopes. */
export type { Taint };
