/**
 * Provider-neutral types for the adapter loop.
 *
 * The shapes in this module describe what the loop needs to know, NOT
 * what any specific LLM SDK ships. Provider adapters
 * (`@adjudicate/anthropic`, `@adjudicate/openai`, …) translate between
 * their SDK's wire types and these.
 *
 * History `H` is opaque: the loop never inspects it. The provider bridge
 * appends user messages, assistant turns, and tool results in whatever
 * shape the SDK consumes.
 */

import type {
  AuditSink,
  Decision,
  IntentEnvelope,
  Ledger,
  PackV0,
  Taint,
} from "@adjudicate/core";
import type { PromptRenderer, ToolSchema } from "@adjudicate/core/llm";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type {
  ConfirmationStore,
  DeferRedis,
  ParkRedis,
} from "./persistence.js";
import type { TraceSink } from "./trace.js";

// ── Provider-neutral wire shapes ──────────────────────────────────────────────

/**
 * Provider-neutral representation of a tool-use request emitted by the
 * model. Anthropic adapters map `ToolUseBlock` → `ToolUseRequest`; OpenAI
 * adapters map `function_call` / `tool_calls[].function` similarly.
 */
export interface ToolUseRequest {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/**
 * Provider-reported token usage for a single assistant turn (ADR-120).
 * Optional — bridges that cannot report usage omit it; the loop treats absence
 * as "no usage to report". NOT part of any hash; surfaced to the adopter via
 * `onTokenUsage` so a token-budget counter can be folded into state S.
 */
export interface TokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/**
 * Provider-neutral representation of a single assistant turn (text and
 * any tool-use blocks). The bridge fans out the SDK-specific response.
 */
export interface AssistantTurn {
  readonly textBlocks: ReadonlyArray<string>;
  readonly toolUses: ReadonlyArray<ToolUseRequest>;
  /** Provider-reported token usage for this turn, when available (ADR-120). */
  readonly usage?: TokenUsage;
}

/**
 * Provider-neutral tool-result payload returned to the model. The bridge
 * encodes this into whatever shape the SDK consumes (Anthropic
 * `tool_result` block; OpenAI `role: "tool"` message).
 */
export interface ToolResultBlock {
  readonly toolUseId: string;
  readonly content: string;
  readonly isError?: boolean;
}

// ── Adopter-supplied executor (carried through to translateDecision) ────────

/**
 * Adopter-supplied side-effect runner. Called only after the kernel
 * returns EXECUTE (or REWRITE — the executor receives the rewritten
 * envelope, NOT the original).
 *
 * READ tools that the LLM proposes go through `invokeRead`; intent
 * executions that the kernel authorized go through `invokeIntent`.
 */
export interface AdopterExecutor<K extends string, P, S> {
  invokeRead(name: string, input: unknown, state: S): Promise<unknown>;
  invokeIntent(envelope: IntentEnvelope<K, P>, state: S): Promise<unknown>;
}

export interface AgentLogger {
  info?: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  debug?: (obj: Record<string, unknown>, msg?: string) => void;
}

// ── Provider bridge contract ─────────────────────────────────────────────────

export interface ProviderRequest {
  readonly systemPrompt: string;
  readonly maxTokens: number;
  readonly toolSchemas: ReadonlyArray<ToolSchema>;
}

/**
 * The provider-neutral driver for the LLM call. Provider adapters
 * implement this against their SDK; the loop calls it once per
 * iteration. `H` is the opaque conversation-history shape — provider
 * adapters choose what `H` is (typically `MessageParam[]` for Anthropic,
 * `ChatCompletionMessageParam[]` for OpenAI). The loop never inspects it.
 */
export interface ProviderBridge<H> {
  /** Construct the empty initial history. */
  emptyHistory(): H;

  /** Append a user message to the history. */
  appendUserMessage(history: H, text: string): H;

  /**
   * Send the prompt + history; receive the assistant turn back. The
   * bridge appends the raw assistant response to history before
   * returning. The provider-neutral `turn` describes what the loop
   * actually needs to know about the response.
   */
  send(
    history: H,
    request: ProviderRequest,
  ): Promise<{ history: H; turn: AssistantTurn }>;

  /**
   * Append a list of tool-result blocks to the history (typically a
   * user-role message containing tool_result blocks for Anthropic; a
   * series of `role: "tool"` messages for OpenAI).
   */
  appendToolResults(
    history: H,
    results: ReadonlyArray<ToolResultBlock>,
  ): H;
}

// ── Public agent surface (generic over history) ──────────────────────────────

export interface AdjudicatedAgentOptions<K extends string, P, S, C, H> {
  /**
   * Pack the agent adjudicates against. MUST already be the output of
   * `installPack(...)` or `withBasisAudit(...)`. The adapter does NOT
   * double-wrap — Pack-author convention applies.
   */
  readonly pack: PackV0<K, P, S, C>;
  /** Renderer producing system prompt + tool schemas for each iteration. */
  readonly renderer: PromptRenderer<S, C>;
  /** Provider bridge wrapping the SDK. */
  readonly bridge: ProviderBridge<H>;
  /** Persistence for DEFER. Combined park + resume surface. */
  readonly deferStore: DeferRedis & ParkRedis;
  /** Persistence for REQUEST_CONFIRMATION pauses (generic over H). */
  readonly confirmationStore: ConfirmationStore<H>;
  readonly auditSink?: AuditSink;
  /** Required: Execution Ledger for replay suppression. */
  readonly ledger: Ledger;
  /** Optional tenant context. */
  readonly runtimeContext?: RuntimeContext;
  /** Hard cap on assistant↔tool ping-pong per .send() call. Defaults to 8. */
  readonly maxIterations?: number;
  /** Adopter-owned executor. Required. */
  readonly executor: AdopterExecutor<K, P, S>;
  /** `rk()` namespacer for the deferStore. Defaults to identity. */
  readonly rk?: (raw: string) => string;
  /** Override the nonce derived from each tool_use block. */
  readonly deriveNonce?: (args: {
    sessionId: string;
    toolUseId: string;
    payload: unknown;
  }) => string;
  readonly log?: AgentLogger;
  /**
   * Fired once per provider response with that turn's token usage (ADR-120).
   * Side-effect-only; MUST NOT throw (the loop guards it). The adapter does NOT
   * mutate state S — the adopter uses this to fold `tokensConsumed` into the
   * next `SendInput.state`, where a `createTokenBudgetGuard` reads it.
   */
  readonly onTokenUsage?: (info: {
    readonly sessionId: string;
    readonly iteration: number;
    readonly usage: TokenUsage | undefined;
  }) => void;
  /**
   * Hash-verification policy for parked envelope blobs at resume.
   * Defaults to `"strict"` (SecurityReviewer-010): a legacy blob lacking
   * verification fields fails closed rather than resuming with a warning.
   */
  readonly verifyParkedHash?: "strict" | "warn" | "off";
  /**
   * Optional low-cardinality trace sink. The loop emits one event per
   * iteration/decision/pause; sink must NOT throw. Defaults to no-op.
   * See `./trace.ts` for the controlled-vocabulary event shape.
   */
  readonly traceSink?: TraceSink;
}

export interface SendInput<S, C, H> {
  readonly sessionId: string;
  readonly userMessage: string;
  readonly state: S;
  readonly context: C;
  readonly history?: H;
}

export interface ResumeArgs<S, C, H> {
  readonly sessionId: string;
  readonly signal: string;
  readonly state: S;
  readonly context: C;
  readonly history?: H;
}

export interface ConfirmArgs<S, C> {
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

export interface AgentTurnResult<H> {
  readonly events: ReadonlyArray<AgentEvent>;
  readonly history: H;
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
      payload: ToolResultBlock;
    };

export interface AdjudicatedAgent<_K extends string, _P, S, C, H> {
  /** One user message + (state, context) snapshot → resolved turn. */
  send(input: SendInput<S, C, H>): Promise<AgentTurnResult<H>>;
  /** Resume a parked DEFER (typically from an adopter's webhook handler). */
  resume(args: ResumeArgs<S, C, H>): Promise<AgentTurnResult<H>>;
  /** Resume a REQUEST_CONFIRMATION with a yes/no from the user. */
  confirm(args: ConfirmArgs<S, C>): Promise<AgentTurnResult<H>>;
}

export type { Taint };
