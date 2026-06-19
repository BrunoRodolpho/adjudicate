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
  ResourceBindingPolicy,
  StructuralMismatch,
  Taint,
} from "@adjudicate/core";
import type { PromptRenderer, ToolSchema } from "@adjudicate/core/llm";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type { ConfigSeal, ConfigSealPolicy, ConfigSealReport } from "@adjudicate/conformance";
import type {
  ConfirmationStore,
  DeferRedis,
  MemoryStore,
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

// ── Typed tool classification (012) ─────────────────────────────────────────

/**
 * 012 — typed `ToolClassification` discriminant.
 *
 * How a model-originated `tool_use` was classified by the bridge. This is a
 * STRUCTURAL claim carried through the loop, NOT a string re-derived from a
 * wire name at each decision point. A `{ kind: "read" }` value is a typed
 * assertion that the executor may be invoked through its READ-ONLY surface
 * (`invokeRead`) and never the mutating surface — the loop can check the
 * discriminant rather than trust a `name in plan.visibleReadTools` lookup.
 *
 * This closes the documented `'a.b'` (intent) vs `'a_b'` (read) wire-name
 * collision (`bridge.ts`): classification is anchored on this discriminant,
 * not on the post-`intentKindToApiName` string. The bridge's
 * `ToolUseClassification` is exactly this union; the alias keeps the typed
 * claim visible on the adapter-facing contracts.
 *
 * Note: distinct from `@adjudicate/core/llm`'s `ToolClassification`, which is
 * the Pack-level READ_ONLY/MUTATING name partition consumed by `safePlan` /
 * `assertPlanReadOnly`. This one is the per-tool-use loop discriminant.
 */
export type ToolClassification =
  | { readonly kind: "read"; readonly name: string; readonly input: unknown }
  | {
      readonly kind: "intent";
      readonly intentKind: string;
      readonly payload: unknown;
    }
  | { readonly kind: "out_of_plan"; readonly name: string };

// ── Adopter-supplied executor (carried through to translateDecision) ────────

/**
 * Adopter-supplied side-effect runner. Called only after the kernel
 * returns EXECUTE (or REWRITE — the executor receives the rewritten
 * envelope, NOT the original).
 *
 * 012 — both surfaces are now reached ONLY on a kernel `EXECUTE`. A
 * model-proposed READ no longer fast-paths to `invokeRead`: it builds an
 * envelope and crosses `adjudicateAndAudit` like every other tool use, and
 * `invokeRead` runs only when the kernel authorized the READ envelope with
 * `EXECUTE` (taint gate + sink + ledger applied). `invokeRead` is the
 * read-only surface; `invokeIntent` is the mutating surface. The typed
 * `ToolClassification` (above) is what tells the loop which surface a given
 * EXECUTE authorizes — read-only-ness is a structural claim, not a wire-name
 * guess. Both signatures are documented against `ToolClassification` so the
 * read-only/mutating split is part of the executor contract.
 */
export interface AdopterExecutor<K extends string, P, S> {
  /**
   * READ-ONLY surface. Reached only when a `{ kind: "read" }`
   * `ToolClassification` was authorized by the kernel (`EXECUTE`). MUST NOT
   * mutate — the `safePlan` / `assertPlanReadOnly` contract guarantees only
   * READ_ONLY tool names ever reach this surface.
   */
  invokeRead(name: string, input: unknown, state: S): Promise<unknown>;
  /**
   * MUTATING surface. Reached only when a `{ kind: "intent" }`
   * `ToolClassification` was authorized by the kernel (`EXECUTE`/validated
   * `REWRITE`).
   *
   * **023 — resource-bound payload only.** The loop verifies the resource
   * binding BEFORE this call: it re-derives `envelope.intentHash` from the
   * envelope's own content and constant-time-compares it against the carried
   * hash (`resourceBindingPolicy`, default `"strict"`). So `invokeIntent` is
   * GUARANTEED to receive the EXACT payload the kernel adjudicated — a payload /
   * resource-ref swapped after the decision fail-closes upstream and never
   * reaches this surface (anti-IDOR). The executor may honor the envelope's
   * `payload` / `resourceRefs` as authoritative.
   */
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

/**
 * 042 — adopter-facing session-contamination configuration for the loop.
 *
 * Structurally compatible with `@adjudicate/primitives`'
 * `SessionContaminationPolicy` (the canonical factory `createSessionContamination
 * Policy` builds exactly this shape) — declared locally so adapter-core does not
 * take a build dependency on primitives. When `enabled`, the loop folds session
 * contamination into the minted intent taint via the lattice meet (monotonic;
 * never raises trust). **Default OFF** when the option is omitted: the
 * non-contaminated path is byte-identical to pre-042.
 */
export interface SessionContaminationConfig {
  readonly enabled: boolean;
}

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
  /**
   * Required: durable governance AuditSink (013/T1). Mirrors the already-required
   * kernel dep `AdjudicateAndAuditDeps.sink` and `ledger` — a missing sink is a
   * construction-time type error, never a silent `noopAuditSink()` no-op (invariant
   * #6: no fail-open defaults). Adopters compose `multiSink` / `bufferedSink` from
   * `@adjudicate/audit` to control fail-open vs fail-closed semantics. For dev,
   * `createQuickAgent` defaults this to a console receipt sink.
   */
  readonly auditSink: AuditSink;
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
   * Fired when the loop catches an out-of-plan tool call (item 7). Side-effect-
   * only; MUST NOT throw (the loop guards it, mirroring `onTokenUsage`). The
   * out_of_plan branch never builds an envelope or reaches `adjudicateAndAudit`,
   * so this can never touch hashed bytes — it is pure "caught a bad call"
   * telemetry the adopter folds into a `CatchUsageStore`.
   */
  readonly onCatch?: (info: {
    readonly sessionId: string;
    readonly toolUseId: string;
    readonly toolName: string;
    readonly reason: "out_of_plan";
  }) => void;
  /**
   * Optional cross-session memory store (ADR-126). When omitted, context passes
   * through unchanged. Read-many; ENRICHES the planner/renderer context only —
   * never the kernel decision, state S, or intentHash.
   */
  readonly memoryStore?: MemoryStore<unknown>;
  /**
   * Pure folder of stored memory into the planner/renderer context, applied
   * once per plan() site BEFORE planner.plan + renderer.render. MUST be pure and
   * MUST NOT influence envelope/payload/taint/nonce. `memory` is null on a cold
   * session. Required for `memoryStore` to take effect.
   */
  readonly enrichContext?: (baseContext: C, memory: unknown | null) => C;
  /**
   * Optional post-turn writeback. Runs AFTER the loop resolves, OUTSIDE the
   * decision path; returning null skips the write. Best-effort (a throwing
   * writeback never fails the turn).
   */
  readonly deriveMemoryWriteback?: (args: {
    readonly sessionId: string;
    readonly baseContext: C;
    readonly priorMemory: unknown | null;
    readonly result: AgentTurnResult<H>;
  }) => { memory: unknown; ttlSeconds: number } | null;
  /**
   * Optional configuration-integrity gate (ADR-121, hardened by ADR-137 and
   * 081). When supplied, the loop verifies the Pack's sealable surface against
   * `seal` at the start of every entry point (send/resume/confirm) per the
   * `reverify` cadence (default `"every_turn"` — kills the old boot-only latch
   * so a post-boot reference-swap is caught), then snapshots the verified
   * policy and reuses it for every adjudication in the turn (so a mid-turn swap
   * cannot affect the decision). On mismatch the turn is REFUSED (no
   * adjudication runs), `onDrift` fires, and — if `engageKillSwitchOnMismatch`
   * — the kill switch is engaged.
   *
   * 081: the sealable surface now binds per-guard CODE artifacts (closure-
   * captured caps + predicate bodies), not just declared guard metadata, so a
   * behavior-changing edit to a closure-captured cap (e.g. a rewrite-guard
   * clamp 5 → 5000) drives a mismatch here instead of verifying clean. The
   * `seal` / `publicKeyPem` / `policy` shapes are unchanged — the strengthening
   * is in what the digest covers.
   *
   * Defaults are intentionally lax for one deprecation release (decision L1): the
   * loop emits a one-time warning when `policy` isn't `require_signature` or when
   * `engageKillSwitchOnMismatch` is unset; a future release flips both.
   */
  readonly configSeal?: {
    readonly seal: ConfigSeal;
    readonly publicKeyPem?: string;
    readonly policy?: ConfigSealPolicy;
    readonly engageKillSwitchOnMismatch?: boolean;
    /**
     * Re-verification cadence. `"every_turn"` (default) re-extracts + re-hashes
     * the live pack each turn (catches reference-swap). `"frozen"` verifies a
     * deep-frozen surface captured at construction (cheapest; catches seal
     * tampering, not live drift). `{ ttlMs }` amortizes `every_turn` under load
     * via a loop-layer clock (never the kernel).
     */
    readonly reverify?: "every_turn" | "frozen" | { readonly ttlMs: number };
    /** Best-effort drift hook (tamper-evident telemetry). Fires on mismatch. */
    readonly onDrift?: (report: ConfigSealReport) => void;
  };
  /**
   * Hash-verification policy for parked envelope blobs at resume.
   * Defaults to `"strict"` (SecurityReviewer-010): a legacy blob lacking
   * verification fields fails closed rather than resuming with a warning.
   */
  readonly verifyParkedHash?: "strict" | "warn" | "off";
  /**
   * 023 — resource-binding policy enforced at the executor seam (`runExecute`)
   * before `invokeIntent`. The executor honors ONLY the kernel-bound (signed)
   * payload: the loop re-derives the envelope's `intentHash` from its own content
   * (the untouched `intentHashInput` recipe — invariant #4) and constant-time-
   * compares it against the carried hash via `timingSafeHexEqual`. A mismatch —
   * the LLM swapped `payload` / `resourceRefs` (031) AFTER the kernel decided —
   * fail-closes the EXECUTE so the executor is never reached (anti-IDOR /
   * anti-resource-swap; invariants #1, #6).
   *
   * Defaults to `"strict"` (inside `runExecute`). `"warn"` still fail-closes on a
   * mismatch (friction never decreases, §C); `"off"` is the rollback dial that
   * restores the exact pre-023 executor seam (023 §7).
   */
  readonly resourceBindingPolicy?: ResourceBindingPolicy;
  /**
   * 042 — session-contamination configuration. When `{ enabled: true }`, an
   * untrusted-origin datum entering the session (an authorized READ result —
   * data pulled from a store/tool, treated as `Retrieved`) contaminates the
   * session: every subsequently minted LLM intent has its taint lowered via the
   * lattice meet (so the kernel's `canPropose` gate sees the contaminated
   * taint) and is stamped with the contaminating origin (so a contamination-
   * lowered refusal is attributed `taint:propagation_violation`). Contamination
   * is monotonic — it can only ADD friction (§C #7) — and is cleared ONLY by the
   * adopter-authenticated `resume()` path, never by an LLM action.
   *
   * **Default OFF** (option omitted): the loop mints the declared taint
   * unchanged, byte-identical to pre-042.
   */
  readonly contamination?: SessionContaminationConfig;
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
  | { kind: "max_iterations_exceeded"; lastDecision: Decision | null }
  /** Config-integrity seal mismatch refused the turn before any adjudication (ADR-121). */
  | { kind: "refused"; reason: string; detail?: string };

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
    }
  /**
   * Post-EXECUTE output-contract violation (item 1). Emitted when a Pack
   * declared `executorContract[kind]` and the executor's return value failed
   * the structural shape. Observation only — EXECUTE already happened and is
   * never flipped; this rides `AgentTurnResult.events`, never the AuditRecord
   * bus.
   */
  | {
      kind: "executor_contract_violation";
      intentHash: string;
      intentKind: string;
      mismatch: StructuralMismatch;
    }
  /**
   * The loop caught an out-of-plan tool call (item 7). The tool was never
   * adjudicated (no envelope built); this is observation only. Pairs with the
   * guarded `onCatch` option and the existing REWRITE-catch counting.
   */
  | {
      kind: "tool_blocked";
      toolUseId: string;
      toolName: string;
      reason: "out_of_plan";
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
