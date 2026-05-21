/**
 * Public types for `@adjudicate/anthropic`.
 *
 * The agent owns the Anthropic Messages API loop. Adopters supply the Pack,
 * the Anthropic client, persistence shims, and (for EXECUTE outcomes) an
 * executor that runs the real side-effects.
 *
 * Most of the type machinery is re-exported from `@adjudicate/adapter-core`
 * so the Anthropic surface stays a thin SDK shim. History is materialized as
 * `ReadonlyArray<MessageParam>` because adopters of `@adjudicate/anthropic`
 * thread Anthropic-native messages through the API.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AdjudicatedAgent as AdjudicatedAgentCore,
  AdjudicatedAgentOptions as AdjudicatedAgentOptionsCore,
  AdopterExecutor,
  AgentEvent as AgentEventCore,
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

/** Anthropic-typed conversation history. Opaque to the kernel. */
export type AnthropicHistory = ReadonlyArray<MessageParam>;

export type ConfirmationStore = ConfirmationStoreCore<AnthropicHistory>;
export type PendingConfirmation = PendingConfirmationCore<AnthropicHistory>;

export type { AdopterExecutor, AgentLogger };
export type AdapterContext = unknown;

export interface AdjudicatedAgentOptions<K extends string, P, S, C> {
  readonly pack: PackV0<K, P, S, C>;
  /** Constructed Anthropic SDK client. Adopter owns auth, baseURL, retries. */
  readonly anthropicClient: Anthropic;
  /** Model id. e.g. `"claude-opus-4-7"`. */
  readonly model: string;
  /** Max output tokens per turn. */
  readonly maxTokens: number;
  /** Renderer override; defaults to `createAnthropicPromptRenderer`. */
  readonly renderer: PromptRenderer<S, C>;
  readonly deferStore: DeferRedis & ParkRedis;
  readonly confirmationStore: ConfirmationStore;
  /**
   * AuditSink — emits one record per Decision through `adjudicateAndAudit`.
   * Defaults to `noopAuditSink()` when absent.
   */
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
  /**
   * Hash-verification policy for parked envelope blobs at resume.
   *
   * The adapter parks full envelope fields (version/nonce/taint/actorPrincipal)
   * at DEFER time so the resume side can re-derive the intentHash and detect
   * tampering. Modes:
   *
   * - `"strict"` — re-derive intentHash, fail-closed on mismatch OR missing
   *   verification fields.
   * - `"warn"` — fail-closed on mismatch; log + allow legacy blobs without
   *   verification fields (default; flip to `"strict"` pre-v1.0).
   * - `"off"` — no verification (NOT recommended for production).
   */
  readonly verifyParkedHash?: "strict" | "warn" | "off";
}

export interface AdjudicatedAgentSendInput<S, C>
  extends Omit<SendInputCore<S, C, AnthropicHistory>, "history"> {
  readonly history?: AnthropicHistory;
}

export interface ResumeAgentArgs<S, C>
  extends Omit<ResumeArgsCore<S, C, AnthropicHistory>, "history"> {
  readonly history?: AnthropicHistory;
}

export type ConfirmAgentArgs<S, C> = ConfirmArgsCore<S, C>;

export type { AgentOutcome };

export type AgentTurnResult = AgentTurnResultCore<AnthropicHistory>;

/**
 * AgentEvent re-exported verbatim from the adapter-core. The `tool_result`
 * payload is the provider-neutral `ToolResultBlock` shape (`toolUseId`,
 * `content`, `isError`). Adopters that previously read `payload.is_error`
 * should migrate to `payload.isError`; the loop maps the neutral block
 * into Anthropic's `ToolResultBlockParam` only at the bridge boundary
 * when re-encoding history for the next API call.
 *
 * Breaking surface change vs v0.5 — see CHANGELOG for the migration.
 */
export type AgentEvent = AgentEventCore;

/** Re-export for consumers that want the provider-neutral tool-result shape. */
export type { ToolResultBlock };

export type AdjudicatedAgent<_K extends string, _P, S, C> = AdjudicatedAgentCore<
  _K,
  _P,
  S,
  C,
  AnthropicHistory
>;

export type { Taint };

// Re-exported for adopter convenience; same types adapter-core uses.
export type { Decision, IntentEnvelope };

// Keep the adapter-core options analogue referenced so changes there
// surface here through the type system rather than as runtime drift.
type _Core = AdjudicatedAgentOptionsCore<string, unknown, unknown, unknown, unknown>;
export type _AdapterCoreOptionsMirror = _Core;
