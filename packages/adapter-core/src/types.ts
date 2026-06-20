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
  BudgetGrant,
  Capability,
  ConfirmationBinding,
  Decision,
  IntentEnvelope,
  Ledger,
  PackV0,
  ResourceBindingPolicy,
  StructuralMismatch,
  Taint,
  UnsignedCapability,
} from "@adjudicate/core";
import type { PromptRenderer, ToolSchema } from "@adjudicate/core/llm";
import type { RuntimeContext } from "@adjudicate/core/kernel";
import type { ConfigSeal, ConfigSealPolicy, ConfigSealReport } from "@adjudicate/conformance";
import type {
  BurnStore,
  ConfirmationStore,
  DeferRedis,
  MemoryStore,
  ParkRedis,
  SessionContaminationStore,
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
   *
   * **024 — additionally cap-gated when a `CapabilityGate` is configured.** The
   * executor signature is UNCHANGED (additive migration, §7): the loop verifies +
   * burns a single-use, kernel-shell-minted ed25519 capability bound to this
   * envelope's `intentHash` BEFORE this call. So when the gate is on,
   * `invokeIntent` is GUARANTEED to be reached only via a successfully burned
   * capability — a second use of the same capability is suppressed by 022's store
   * and never reaches here. When the gate is off (default), this is the pre-024
   * raw-envelope path.
   */
  invokeIntent(envelope: IntentEnvelope<K, P>, state: S): Promise<unknown>;
}

// ── 024 — cap-gated executor contract ───────────────────────────────────────

/**
 * 024 — the kernel-shell-minted, single-use, resource-bound capability gate the
 * executor seam honors INSTEAD of a raw (possibly REWRITE-rewritten)
 * `IntentEnvelope`. This makes the §B topology's "on EXECUTE → mint signed
 * CAPABILITY → capability-gated EXECUTION FABRIC" edge enforced in code rather
 * than by pack-author convention.
 *
 * **§D purity boundary (preserved bytewise).** The PURE `adjudicate()` produces
 * the Decision; the IMPURE shell (the loop) mints + signs the capability AFTER
 * the pure EXECUTE/REWRITE decision and the executor honors it. The kernel never
 * signs (its `attest` stub stays a throwing v0.2 seam). Constitutional invariant
 * #1 is unchanged: ONLY a kernel EXECUTE (or the REWRITE-rewritten envelope)
 * reaches `invokeIntent`, NOW additionally gated by a burned-on-use capability.
 *
 * **Kernel authority = ed25519, NOT the forgeable hash-bind (021-F1).** The gate
 * honors a capability as kernel-minted ONLY when `verify` returns true. Adopters
 * MUST wire `verify` to approval-engine's ASYMMETRIC `verifyCapabilitySignature`
 * (bound with the issuer's registered public keys) — NEVER core's pure-JS
 * `verifyCapability`, which checks only hash-bind self-consistency (integrity,
 * not authenticity) and is forgeable by anyone who can recompute the canonical
 * hash. The signer (`mint`) and verifier (`verify`) are DEPENDENCY-INJECTED so
 * adapter-core never imports `@adjudicate/approval-engine` (that would be a
 * dependency cycle — approval-engine depends on adapter-core) and stays free of
 * `node:crypto` / browser-bundleable, mirroring the config-seal verifier seam.
 *
 * **Single-use is delegated to 022's BurnStore.** The gate does NOT introduce a
 * second single-use store: it CONSUMES 022's authoritative atomic claim-and-burn
 * `BurnStore` (`createInMemoryBurnStore` / `createRedisBurnStore`). The loop
 * mints the capability into the store on the EXECUTE/REWRITE decision (keyed by
 * the envelope nonce, first-writer-wins); the executor seam BURNS it before
 * dispatch. A second use of the same capability re-burns to `null` and is
 * suppressed — never a parallel one (the Redis backing is Lua-atomic).
 *
 * **Resource binding (023).** The burned capability binds the authorizing
 * `intentHash` (which content-addresses kind+payload+taint+nonce+actor+origin,
 * §D #4); the gate constant-time-compares it against the effective envelope's
 * own `intentHash` so a capability minted for intent A cannot be redeemed for
 * intent B (anti-IDOR / anti-resource-swap). This composes ABOVE the 023
 * `verifyResourceBinding` check `runExecute` already runs.
 *
 * **Fail-closed (§D #6 / §C monotonicity).** A burn miss/expiry, a store/IO
 * error, a failed ed25519 verify, or an intentHash mismatch ABORTS the EXECUTE —
 * `invokeIntent` is never reached. Gating can only ADD friction, never authorize
 * an EXECUTE the kernel did not. Omitting the gate (default) restores the exact
 * pre-024 raw-envelope `invokeIntent` path (rollback dial, §7).
 */
export interface CapabilityGate {
  /**
   * Mint + SIGN the capability in the impure shell, AFTER the pure EXECUTE/
   * REWRITE decision. Adopters wire approval-engine's node-side `signCapability`
   * (ed25519 over the canonical `capabilityPreimage`). MUST bind the EXACT
   * `intentHash` of the effective (EXECUTE or REWRITE-rewritten) envelope. May be
   * synchronous; the loop awaits the result either way.
   */
  readonly mint: (body: UnsignedCapability) => Capability | Promise<Capability>;
  /**
   * Verify a burned capability is genuinely kernel-minted via ASYMMETRIC ed25519
   * signature verification (021-F1: NOT the forgeable hash-bind check). Adopters
   * wire approval-engine's `verifyCapabilitySignature` partially applied with the
   * issuer's registered public keys: `(cap) => verifyCapabilitySignature(cap,
   * publicKeyPemByKeyId)`. MUST return false (never throw) on any unknown key /
   * bad signature / non-ed25519 alg (the injected verifier already fails closed).
   */
  readonly verify: (capability: Capability) => boolean;
  /**
   * 022's authoritative atomic claim-and-burn store. The loop `mint`s into it on
   * the decision; the executor seam `burn`s before dispatch (single-use). NOT a
   * new single-use store — 024 consumes 022's.
   */
  readonly burnStore: BurnStore;
  /**
   * The deciding kernel identity id (`KernelIdentity.id`, e.g.
   * `kernel://prod/us-east-1`) recorded in the minted capability body. Descriptive
   * — the kernel never signs; the shell signs over a pre-image that binds this id.
   */
  readonly kernelId: string;
  /**
   * Capability TTL in seconds (the burn store's expiry). Defaults to a short
   * window (the side effect happens in the same turn, milliseconds after the
   * mint). Fail-closed past TTL (§D #6): an expired capability burns to `null`.
   */
  readonly ttlSeconds?: number;
}

/**
 * 025 — capabilities-as-budgets configuration for the loop.
 *
 * Pairs the authoritative, single-use-COUNTED budget store (the
 * `ParkRedis.evalIncrCheck` atomic burn-down primitive — supply a
 * `createInMemoryDeferStore()` for tests/quickstart, a Redis client exposing
 * `evalIncrCheck` in production) with a host-supplied resolver that maps an
 * intent kind to the standing grant authorizing it (or `undefined` when no
 * budget covers that kind). The resolver is the host's authority: it returns a
 * grant ONLY for kinds an operator has actually pre-authorized (e.g. a
 * budget-capable kind declared in a Pack's `capabilities.ts`).
 *
 * **Default OFF** (the whole option omitted): the REQUEST_CONFIRMATION path is
 * byte-identical to pre-025.
 */
export interface BudgetConfig {
  /**
   * Authoritative atomic burn-down store — only the `evalIncrCheck` Lua hook is
   * required (a single-use-counted store has no safe non-atomic fallback). Wire a
   * `createInMemoryDeferStore()` (tests) or a Redis client with `evalIncrCheck`.
   */
  readonly store: Pick<ParkRedis, "evalIncrCheck">;
  /**
   * Resolve the standing budget grant that pre-authorizes `intentKind`, or
   * `undefined` when no budget covers it. The host owns this mapping (an operator
   * issued the grant). The loop substitutes EXECUTE for REQUEST_CONFIRMATION ONLY
   * when this returns a grant AND the atomic burn-down against `grant.limit`
   * stays in-budget. The returned grant's `intentKind` MUST equal `intentKind`
   * (the kernel re-checks `grant.intentKind === envelope.kind` — a mismatch is a
   * no-op, friction-preserving).
   */
  readonly resolveGrant: (
    intentKind: string,
  ) => BudgetGrant | undefined | Promise<BudgetGrant | undefined>;
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

/**
 * The configuration-integrity seal gate options on `AdjudicatedAgentOptions`
 * (ADR-121, hardened by ADR-137/081/082). Named so the 084 staged-rollout
 * canary-stage helper can RETURN a fail-closed instance of exactly this shape.
 *
 * 084 — STRICT KNOB PAIRING (see the field docs below). At the CANARY rollout
 * stage these knobs MUST be `policy:"require_signature"` +
 * `engageKillSwitchOnMismatch:true` + `reverify:"every_turn"`, so a seal drift
 * during canary LATCHES the kill switch (fail-closed) instead of self-healing
 * the next turn (§C monotonicity / §D-7: a rollout may only ADD friction).
 * `canaryStageConfigSeal(...)` constructs that posture from a seal + key.
 */
export interface AgentConfigSealOptions {
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
}

/**
 * 084 — build the fail-closed CANARY-stage seal posture. At the canary stage of
 * a staged rollout the loop MUST enforce the strict seal knobs so a seal drift
 * LATCHES the kill switch (fail-closed) rather than only refusing the current
 * turn and self-healing the next (the lax deprecation-window default the loop
 * still allows for normal turns, loop.ts L1 warning).
 *
 * Returns an `AgentConfigSealOptions` with:
 *   - `policy: "require_signature"`        — an unsigned/re-signed seal cannot pass
 *   - `engageKillSwitchOnMismatch: true`   — drift ENGAGES (latches) the kill switch
 *   - `reverify: "every_turn"`             — re-verify every turn (catch a live swap)
 *
 * The caller supplies the recorded `seal` + the publisher's `publicKeyPem` (both
 * injected snapshots, §D — never derived here). An optional `onDrift` telemetry
 * hook is threaded. The strict knobs are NON-OVERRIDABLE by design: scoping the
 * strict posture to the canary stage (§7 risk mitigation) leaves the documented
 * one-release lax default intact for normal turns while making the canary gate
 * itself fail-closed. §C/§D-7: the rollout may only ADD friction, never relax it.
 */
export function canaryStageConfigSeal(args: {
  readonly seal: ConfigSeal;
  readonly publicKeyPem: string;
  readonly onDrift?: (report: ConfigSealReport) => void;
}): AgentConfigSealOptions {
  return {
    seal: args.seal,
    publicKeyPem: args.publicKeyPem,
    // Fail-closed canary-stage knobs — these are the load-bearing constants.
    policy: "require_signature",
    engageKillSwitchOnMismatch: true,
    reverify: "every_turn",
    ...(args.onDrift !== undefined ? { onDrift: args.onDrift } : {}),
  };
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
   *
   * 082 — STRICT KNOB PAIRING (operators MUST set this for fail-closed posture).
   * The same `require_signature` enforcement `installPack`'s `verifyOnLoad` runs
   * at load time is honored at RUNTIME by the loop's `checkConfigSeal` wiring
   * (`loop.ts`) ONLY when BOTH knobs are set together:
   *
   *   configSeal: {
   *     seal, publicKeyPem,
   *     policy: "require_signature",          // an unsigned seal cannot satisfy the gate
   *     engageKillSwitchOnMismatch: true,     // drift engages the kill switch, not just a warn
   *   }
   *
   * Without `policy:"require_signature"` + `publicKeyPem` the seal verifies on
   * DIGEST only (a re-signed/forged seal can pass); without
   * `engageKillSwitchOnMismatch:true` a drift only refuses the current turn and
   * self-heals next turn (no latch). Pair BOTH to close the lax-default gap at
   * the adopter (§C: failure → friction, never bypass). This is documented, not
   * silently relied upon (082 §7 risk: lax adapter default).
   */
  readonly configSeal?: AgentConfigSealOptions;
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
   * 024 — cap-gated executor. When supplied, the loop mints a kernel-shell-signed,
   * single-use, resource-bound capability AFTER the pure EXECUTE/REWRITE decision
   * and the executor seam (`runExecute`) honors it: it BURNS the capability from
   * 022's atomic store, ed25519-VERIFIES it (the injected `verify`), and binds it
   * to the effective envelope's `intentHash` BEFORE `invokeIntent`. Any failure
   * (burn miss/expiry, store error, bad signature, hash mismatch) fail-closes the
   * EXECUTE — `invokeIntent` is never reached (invariants #1, #6; §C: friction
   * never decreases).
   *
   * **Default OFF** (option omitted): the executor seam is byte-identical to
   * pre-024 (the raw-envelope `invokeIntent` path), so existing executors and the
   * 071–073 consumers opt in. The READ path (`invokeRead`) is never cap-gated —
   * a READ can never reach `invokeIntent`.
   */
  readonly capabilityGate?: CapabilityGate;
  /**
   * 025 — capabilities-as-budgets. When supplied, an intent kind that the kernel
   * would otherwise REQUEST_CONFIRMATION for can satisfy the "ask first"
   * threshold via a standing, human-granted, BOUNDED budget — WITHOUT a
   * per-intent confirmation receipt — up to the grant's `limit` per window.
   *
   * The loop adjudicates the intent normally first; ONLY on a
   * REQUEST_CONFIRMATION outcome does it resolve a grant for the envelope's kind
   * (`resolveGrant`), ATOMICALLY burn down one unit against the grant's `limit`
   * (the `store.evalIncrCheck` Lua primitive), and — on a successful, in-budget
   * decrement — RE-adjudicate with the kernel `budgetGrant` asserted, producing a
   * budget-satisfied EXECUTE that supersedes the REQUEST_CONFIRMATION audit row.
   * Over-limit / no grant / store error leaves the original REQUEST_CONFIRMATION
   * standing (fail-closed to friction, §C). The kernel never weakens any
   * state/taint/auth/business guard — only the threshold step is satisfied
   * (§D #2 closed algebra; §C monotonicity carve-out, deterministic recorded
   * input).
   *
   * **Default OFF** (option omitted): the loop never burns down a budget and the
   * REQUEST_CONFIRMATION path is byte-identical to pre-025.
   */
  readonly budget?: BudgetConfig;
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
   * 042 / H4 — durable, session-scoped store for the contamination flag. The
   * pre-H4 loop held the flag ONLY in a turn-local variable, so a flag set by an
   * authorized READ on turn 1 was LOST when turn 2's `runLoop` re-initialised it
   * to clean — even though the laundered datum lives on in the session-scoped
   * conversation history re-supplied across turns. That let a multi-turn launder
   * ("read poisoned doc turn 1, act on it turn 2") mint a clean-origin intent and
   * slip the kernel's origin gate. Supplying this store persists the flag across
   * turns so a later turn proposing off the contaminated history is gated.
   *
   * Loaded at the TOP of every `runLoop`, folded monotonically within the turn,
   * and persisted whenever a served READ contaminates. Cleared ONLY on the
   * authenticated `resume()` path — never by an LLM action.
   *
   * **Default OFF / no-store byte-identical:** only consulted when `contamination
   * .enabled === true` AND this store is supplied. With either absent, the loop
   * keeps the turn-local flag exactly as pre-H4 — no load, no writeback, no clear
   * — so the contamination-disabled and no-store paths are byte-identical.
   */
  readonly contaminationStore?: SessionContaminationStore;
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
  /**
   * 071 — optional binding tuple the post-confirmation EXECUTE is provably tied
   * to. When supplied, the loop forwards it onto the kernel's
   * `confirmationReceipt.binding` so the override is gated on (and the audit
   * trail records) the (capability, approver, channel) the confirmation
   * resolved with. Each field's `confirmed` is the value the confirmation
   * arrived with; the optional `requested` is the value the original
   * REQUEST_CONFIRMATION was issued against (a mismatch fails closed in the
   * kernel — friction, never bypass). The loop ADDS the
   * `intentHash`/`at`/`token` itself (it owns the already-verified pending
   * envelope); a caller (e.g. the approval-engine `resolve`) supplies only the
   * binding it holds. STRICTLY ADDITIVE: omitting `binding` is byte-identical to
   * pre-071 confirm().
   */
  readonly binding?: ConfirmationBinding;
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
