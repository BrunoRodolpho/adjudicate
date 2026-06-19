/**
 * Decision → provider-neutral tool-result + loop-action translator.
 *
 * One branch per `Decision.kind`. Returns:
 * - `toolResult` — the provider-neutral `ToolResultBlock` that goes back
 *   to the model in the next user-role message (or `null` if no tool-
 *   result is sent).
 * - `loopAction` — what the loop should do next: `continue` (next
 *   iteration), `pause_for_user_confirmation` / `pause_for_defer`
 *   (return outcome to adopter), or `complete_for_escalation`
 *   (terminate the turn).
 * - `events` — `AgentEvent`s to push for audit / transcript display.
 *
 * **REWRITE** runs the executor against the *rewritten* envelope (NOT
 * the original) and surfaces a human-readable note in the tool-result
 * by default.
 *
 * **REWRITE re-adjudication contract (011/T4).** A REWRITE Decision only ever
 * reaches this translator from `adjudicateAndAudit` (the audited kernel path the
 * loop drives). That path re-enters the PURE kernel on the rewritten envelope —
 * re-deriving its `intentHash` fail-closed, re-running the full guard order, and
 * blocking a taint-elevating rewrite — and surfaces a `REWRITE` Decision ONLY
 * when the rewritten envelope passed a SECOND-pass EXECUTE. It also records the
 * EXECUTED (rewritten) hash in the audit row and claims the rewritten hash in
 * the ledger. So executing `decision.rewritten` here is NOT a raw, un-adjudicated
 * `invokeIntent`: the kernel already authorized and recorded these exact bytes.
 * `runExecute` defends this contract — it refuses to execute a rewritten envelope
 * whose `intentHash` does not re-derive from its own content (a forged Decision
 * spliced in outside the kernel path).
 *
 * **023 — resource-binding (executor honors the signed payload).** `runExecute`
 * now enforces the resource binding for BOTH EXECUTE and REWRITE before the side
 * effect: it re-derives the envelope's `intentHash` (`verifyResourceBinding`,
 * the untouched `intentHashInput` recipe) and constant-time-compares it against
 * the carried hash. This SUBSUMES the 011/T4 forged-rewrite check and EXTENDS the
 * same fence to the EXECUTE payload, so a `payload` / `resourceRefs` swapped
 * AFTER the kernel decision (anti-IDOR / anti-resource-swap) fail-closes and the
 * executor is never invoked (invariants #1, #6). It coexists with 012's READ
 * routing (reads serve via `invokeRead`, never `invokeIntent`, and never reach
 * this binding gate) and 013's required `auditSink` (the kernel crossing that
 * produced this Decision already emitted the durable record).
 *
 * **First non-continue Decision wins**: if multiple tool_use blocks fire
 * in the same assistant turn, the loop processes them in order but
 * stops translating the moment a non-continue Decision arrives. The
 * remaining blocks are surfaced as `not_processed_due_to_pause`.
 */

import {
  DEFAULT_RESOURCE_BINDING_POLICY,
  timingSafeHexEqual,
  validateOutputShape,
  verifyResourceBinding,
} from "@adjudicate/core";
import type {
  AuditSink,
  Capability,
  Decision,
  ExecutorContract,
  IntentEnvelope,
  Ledger,
  ResourceBindingPolicy,
  TaintPolicy,
} from "@adjudicate/core";
import { adjudicateAndAudit, type RuntimeContext } from "@adjudicate/core/kernel";
import type { PolicyBundle } from "@adjudicate/core/kernel";
import { parkDeferredIntent } from "@adjudicate/runtime";
import { buildEnvelopeFromToolUse } from "./bridge.js";
import { AdapterError, AdapterErrorCode } from "./errors.js";
import type {
  ConfirmationStore,
  DeferRedis,
  ParkRedis,
} from "./persistence.js";
import type {
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
  CapabilityGate,
  ToolClassification,
  ToolResultBlock,
} from "./types.js";

export interface DecisionTranslationContext<K extends string, P, S, H> {
  readonly decision: Decision;
  readonly envelope: IntentEnvelope<K, P>;
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly state: S;
  readonly executor: AdopterExecutor<K, P, S>;
  readonly deferStore: DeferRedis & ParkRedis;
  readonly confirmationStore: ConfirmationStore<H>;
  readonly historySnapshot: H;
  readonly rk: (raw: string) => string;
  readonly log?: AgentLogger;
  /**
   * Per-turn token generator. Adapter passes `crypto.randomUUID()` by
   * default; tests can inject a deterministic generator.
   */
  readonly generateToken: () => string;
  /**
   * Optional executor output contract for this envelope's kind (resolved by the
   * loop from `PackV0.executorContract`). When present, `runExecute` validates
   * the executor's return value AFTER `invokeIntent` and PREPENDS an
   * `executor_contract_violation` event on mismatch — never altering the tool
   * result or loop action.
   */
  readonly executorContract?: ExecutorContract;
  /**
   * 023 — resource-binding policy enforced at the executor seam before
   * `invokeIntent`. `"strict"` (default) / `"warn"` fail-close the EXECUTE when
   * the envelope's payload/resource-refs no longer re-derive its `intentHash`
   * (anti-IDOR / anti-resource-swap); `"off"` is the rollback dial that restores
   * the pre-023 seam. Mirrors `verifyParkedHash` on the parked-envelope path so
   * the two binding checks share one staged-rollout vocabulary.
   */
  readonly resourceBindingPolicy?: ResourceBindingPolicy;
  /**
   * 024 — cap-gated executor. When present, `runExecute` BURNS the single-use
   * capability the loop minted into `capabilityGate.burnStore` (keyed by the
   * effective envelope's nonce), ed25519-VERIFIES it (`capabilityGate.verify` —
   * the injected `verifyCapabilitySignature`, NOT the forgeable hash-bind check),
   * and binds it to the effective envelope's `intentHash` BEFORE `invokeIntent`.
   * A burn miss/expiry, store error, bad signature, or hash mismatch fail-closes
   * the EXECUTE (invariants #1, #6). Absent (default) → the pre-024 seam.
   */
  readonly capabilityGate?: CapabilityGate;
}

export type LoopAction =
  | { readonly kind: "continue" }
  | {
      readonly kind: "pause_for_user_confirmation";
      readonly prompt: string;
      readonly token: string;
    }
  | {
      readonly kind: "pause_for_defer";
      readonly signal: string;
      readonly intentHash: string;
    }
  | {
      readonly kind: "complete_for_escalation";
      readonly to: "human" | "supervisor";
      readonly reason: string;
    };

export interface DecisionTranslation {
  readonly toolResult: ToolResultBlock | null;
  readonly loopAction: LoopAction;
  readonly extraEvents: ReadonlyArray<AgentEvent>;
}

/**
 * Translate a `Decision` into a provider-neutral `ToolResultBlock` plus
 * the next loop action. The caller (the send loop) appends the tool-
 * result to the next user-role message and either continues or pauses
 * based on `loopAction.kind`.
 */
export async function translateDecision<K extends string, P, S, H>(
  ctx: DecisionTranslationContext<K, P, S, H>,
): Promise<DecisionTranslation> {
  switch (ctx.decision.kind) {
    case "EXECUTE":
      return runExecute(ctx, ctx.envelope, null);
    case "REWRITE":
      return runExecute(
        ctx,
        ctx.decision.rewritten as IntentEnvelope<K, P>,
        ctx.decision.reason,
      );
    case "REFUSE": {
      const text = ctx.decision.refusal.userFacing;
      const result: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content: text,
        isError: true,
      };
      return {
        toolResult: result,
        loopAction: { kind: "continue" },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
        ],
      };
    }
    case "REQUEST_CONFIRMATION": {
      const token = ctx.generateToken();
      await ctx.confirmationStore.put(
        token,
        {
          envelope: ctx.envelope,
          sessionId: ctx.sessionId,
          assistantHistorySnapshot: ctx.historySnapshot,
          toolUseId: ctx.toolUseId,
          prompt: ctx.decision.prompt,
        },
        24 * 60 * 60,
      );
      const result: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content: `Confirmation required: ${ctx.decision.prompt}`,
      };
      return {
        toolResult: result,
        loopAction: {
          kind: "pause_for_user_confirmation",
          prompt: ctx.decision.prompt,
          token,
        },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
        ],
      };
    }
    case "ESCALATE": {
      const result: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content: `Escalated to ${ctx.decision.to}: ${ctx.decision.reason}`,
      };
      return {
        toolResult: result,
        loopAction: {
          kind: "complete_for_escalation",
          to: ctx.decision.to,
          reason: ctx.decision.reason,
        },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
        ],
      };
    }
    case "DEFER": {
      const ttlSeconds = Math.max(ctx.decision.timeoutMs, 1000) / 1000 + 60;
      const parkResult = await parkDeferredIntent({
        envelope: {
          intentHash: ctx.envelope.intentHash,
          kind: ctx.envelope.kind,
          actor: { sessionId: ctx.envelope.actor.sessionId },
          payload: ctx.envelope.payload,
          // Hash-verification fields. The resume path re-derives intentHash
          // via sha256Canonical and asserts byte-equality with the stored
          // value — detects blob tampering between park and resume. 041 added
          // `origin` to the recipe, so it MUST be stored for re-derivation.
          version: ctx.envelope.version,
          nonce: ctx.envelope.nonce,
          taint: ctx.envelope.taint,
          actorPrincipal: ctx.envelope.actor.principal,
          origin: ctx.envelope.origin,
        },
        signal: ctx.decision.signal,
        ttlSeconds,
        redis: ctx.deferStore,
        rk: ctx.rk,
        log: ctx.log,
      });
      if (!parkResult.parked) {
        const result: ToolResultBlock = {
          toolUseId: ctx.toolUseId,
          content: `This action could not be queued (per-session quota exceeded; ${parkResult.observed}/${parkResult.limit}).`,
          isError: true,
        };
        return {
          toolResult: result,
          loopAction: { kind: "continue" },
          extraEvents: [
            { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
          ],
        };
      }
      const result: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content: `Action queued. Waiting for signal "${ctx.decision.signal}" (timeout ${ctx.decision.timeoutMs}ms).`,
      };
      return {
        toolResult: result,
        loopAction: {
          kind: "pause_for_defer",
          signal: ctx.decision.signal,
          intentHash: ctx.envelope.intentHash,
        },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
        ],
      };
    }
  }
}

/**
 * Shared EXECUTE / REWRITE path. Runs the adopter's executor against the
 * envelope passed in (the original for EXECUTE, the rewritten one for
 * REWRITE), serializes the result, and returns a continue-loop translation.
 *
 * 023 — before invoking the executor it ENFORCES the resource binding
 * (`verifyResourceBinding`) so `invokeIntent` only ever receives the exact
 * kernel-bound payload; a post-decision resource-swap fail-closes here.
 */
async function runExecute<K extends string, P, S, H>(
  ctx: DecisionTranslationContext<K, P, S, H>,
  effectiveEnvelope: IntentEnvelope<K, P>,
  rewriteReason: string | null,
): Promise<DecisionTranslation> {
  // 023 — resource-binding enforcement at the executor seam. Before the side
  // effect, re-derive the envelope's `intentHash` from its OWN content (the same
  // `intentHashInput` recipe `buildEnvelope` / the kernel's step-1b gate use,
  // untouched — invariant #4) and constant-time-compare it against the carried
  // `effectiveEnvelope.intentHash`. The executor must honor ONLY the kernel-bound
  // (signed) payload: if the LLM swapped `payload` or `resourceRefs` (031, the
  // per-kind authorization target) AFTER the kernel decided, the re-derived hash
  // differs and the binding FAILS — `invokeIntent` is NOT reached (anti-IDOR /
  // anti-resource-swap; preserves invariant #1, fail-closed per #6). This runs for
  // BOTH EXECUTE and REWRITE: it SUBSUMES the 011/T4 forged-rewrite check
  // (re-derive the rewritten hash fail-closed) AND extends the same fence to the
  // EXECUTE payload, so a post-decision resource-swap can never reach the executor.
  // `"off"` (rollback dial) restores the exact pre-023 seam.
  const bindingPolicy =
    ctx.resourceBindingPolicy ?? DEFAULT_RESOURCE_BINDING_POLICY;
  if (bindingPolicy !== "off") {
    const binding = verifyResourceBinding(effectiveEnvelope as IntentEnvelope);
    if (!binding.bound) {
      // The message differs by path so the operator sees the right cause: a
      // forged REWRITE keeps the 011 wording; a swapped EXECUTE payload is an
      // anti-IDOR binding failure. Either way: fail-closed, executor NOT invoked.
      const content =
        rewriteReason !== null
          ? "Rewritten action could not be verified and was not executed."
          : "Action could not be verified (resource binding mismatch) and was not executed.";
      ctx.log?.warn?.(
        {
          toolUseId: ctx.toolUseId,
          sessionId: ctx.sessionId,
          intentKind: effectiveEnvelope.kind,
          derived: binding.derived,
          stored: binding.stored,
          path: rewriteReason !== null ? "rewrite" : "execute",
        },
        "[adjudicate] resource-binding mismatch — refusing to execute (anti-IDOR)",
      );
      const errResult: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content,
        isError: true,
      };
      return {
        toolResult: errResult,
        loopAction: { kind: "continue" },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: errResult },
        ],
      };
    }
  }

  // 024 — cap-gated executor. When a CapabilityGate is configured, the executor
  // honors a kernel-shell-minted, single-use, resource-bound capability INSTEAD
  // of a raw envelope. The loop minted + signed the capability into 022's atomic
  // BurnStore (keyed by the effective envelope's nonce) AFTER the pure decision;
  // here we redeem it EXACTLY ONCE before the side effect:
  //   1. BURN it from 022's store (single-use; a second use re-burns to null and
  //      is suppressed — the atomic claim-and-burn, never a parallel one).
  //   2. ed25519-VERIFY it via the injected `verify` (021-F1: the ASYMMETRIC
  //      `verifyCapabilitySignature`, NOT the forgeable hash-bind `verifyCapability`)
  //      — proof of KERNEL minting, not mere self-consistency.
  //   3. BIND it to THIS envelope: the capability's `intentHash` must
  //      constant-time-equal the effective envelope's own `intentHash` (already
  //      re-derived clean by the 023 binding gate above), so a capability minted
  //      for intent A cannot be redeemed for intent B (anti-IDOR / anti-replay).
  // Any failure ABORTS the EXECUTE — `invokeIntent` is NOT reached (invariant #1,
  // fail-closed per #6; §C: gating only adds friction). The gate is async (the
  // store burn awaits); a thrown store/IO error is caught below and surfaces as a
  // non-executing error tool-result (no fail-open).
  if (ctx.capabilityGate !== undefined) {
    const gate = ctx.capabilityGate;
    let burned: Capability | null;
    try {
      burned = await gate.burnStore.burn(effectiveEnvelope.nonce);
    } catch (err) {
      // Store/IO error on the burn (write) path → fail-closed (§D #6). No
      // redemption, executor NOT invoked.
      ctx.log?.warn?.(
        {
          toolUseId: ctx.toolUseId,
          sessionId: ctx.sessionId,
          intentKind: effectiveEnvelope.kind,
          error: err instanceof Error ? err.message : String(err),
        },
        "[adjudicate] capability burn store error — refusing to execute (fail-closed)",
      );
      burned = null;
    }
    // Verify exactly once (the injected `verify` is the ed25519 authority leg).
    const sigOk = burned !== null && gate.verify(burned);
    const capOk =
      burned !== null &&
      sigOk &&
      timingSafeHexEqual(burned.intentHash, effectiveEnvelope.intentHash);
    if (!capOk) {
      ctx.log?.warn?.(
        {
          toolUseId: ctx.toolUseId,
          sessionId: ctx.sessionId,
          intentKind: effectiveEnvelope.kind,
          reason:
            burned === null
              ? "burn_miss"
              : !sigOk
                ? "bad_signature"
                : "intent_hash_mismatch",
        },
        "[adjudicate] capability gate failed — refusing to execute (fail-closed)",
      );
      const errResult: ToolResultBlock = {
        toolUseId: ctx.toolUseId,
        content:
          "Action could not be authorized (capability gate) and was not executed.",
        isError: true,
      };
      return {
        toolResult: errResult,
        loopAction: { kind: "continue" },
        extraEvents: [
          { kind: "tool_result", toolUseId: ctx.toolUseId, payload: errResult },
        ],
      };
    }
  }

  let executorResult: unknown;
  try {
    executorResult = await ctx.executor.invokeIntent(
      effectiveEnvelope,
      ctx.state,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "executor threw a non-Error value";
    const errResult: ToolResultBlock = {
      toolUseId: ctx.toolUseId,
      content: `Executor failed: ${message}`,
      isError: true,
    };
    return {
      toolResult: errResult,
      loopAction: { kind: "continue" },
      extraEvents: [
        { kind: "tool_result", toolUseId: ctx.toolUseId, payload: errResult },
      ],
    };
  }

  const handlerEvent: AgentEvent = {
    kind: "handler_result",
    toolUseId: ctx.toolUseId,
    result: executorResult,
  };

  const body =
    rewriteReason === null
      ? { ok: true, result: executorResult }
      : {
          ok: true,
          result: executorResult,
          note: `Note: kernel rewrote your proposal — ${rewriteReason}`,
        };

  const result: ToolResultBlock = {
    toolUseId: ctx.toolUseId,
    content: JSON.stringify(body),
  };

  // Optional post-EXECUTE output-contract check (item 1). EXECUTE has already
  // happened; a mismatch is a SEPARATE observation layer — it PREPENDS an event
  // and never alters the tool result or loop action (the non-flip invariant).
  const contractEvents: AgentEvent[] = [];
  if (ctx.executorContract) {
    const mismatch = validateOutputShape(
      executorResult,
      ctx.executorContract.outputShape,
    );
    if (mismatch) {
      contractEvents.push({
        kind: "executor_contract_violation",
        intentHash: effectiveEnvelope.intentHash,
        intentKind: effectiveEnvelope.kind,
        mismatch,
      });
    }
  }

  return {
    toolResult: result,
    loopAction: { kind: "continue" },
    extraEvents: [
      ...contractEvents,
      handlerEvent,
      { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
    ],
  };
}

/**
 * Build the provider-neutral `ToolResultBlock` for an out-of-plan tool
 * call. Re-exported so tests + adopters can construct one from outside
 * the loop.
 */
export function makeOutOfPlanToolResult(
  toolUseId: string,
  toolName: string,
): ToolResultBlock {
  return {
    toolUseId,
    content: `Tool "${toolName}" is not available in the current plan.`,
    isError: true,
  };
}

// ── 012: READ through the kernel ────────────────────────────────────────────

/**
 * 012 — read-authorization PolicyBundle.
 *
 * A model-proposed READ is no longer dispatched straight to `invokeRead`. It
 * builds an envelope and crosses `adjudicateAndAudit`, so the taint gate, the
 * required audit sink, and the ledger apply uniformly — restoring the §B
 * single-authority property (the kernel decides for READs too).
 *
 * The read envelope is adjudicated against THIS policy (derived per-call from
 * the Pack's own `taint` policy), not the Pack's mutation policy:
 *   - `taint` = the Pack's taint policy, so a taint-protected read tool (one
 *     whose `minimumFor` demands TRUSTED/SYSTEM) is REFUSED for an UNTRUSTED
 *     proposal exactly like a protected intent — no UNTRUSTED read EXECUTEs
 *     when the policy forbids it.
 *   - no state/auth/business guards, because read tool *names* are not intent
 *     kinds the Pack's guards are written against; the plan's
 *     `visibleReadTools` membership is already enforced upstream by
 *     `classifyIncomingToolUse` (an out-of-plan read never reaches here).
 *   - `default: "EXECUTE"` so a visible, taint-passing read is authorized and
 *     served. This is NOT a fail-open mutation default: an `EXECUTE` here only
 *     ever reaches `invokeRead` — the READ-ONLY executor surface the
 *     `safePlan` / `assertPlanReadOnly` contract guarantees is non-mutating.
 *     Only a kernel `EXECUTE` reaches the executor (§D #1); any REFUSE (taint,
 *     kill-switch, replay-suppression) means the read is NOT served.
 *
 * The kernel stays pure: this is an ordinary `PolicyBundle`, no heuristic or
 * IO is introduced inside `adjudicate()`.
 */
export function readAuthorizationPolicy(
  taint: TaintPolicy,
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint,
    business: [],
    default: "EXECUTE",
  };
}

export interface RouteReadContext<S, H> {
  /** Typed READ classification produced by the bridge (`kind: "read"`). */
  readonly classification: Extract<ToolClassification, { kind: "read" }>;
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly state: S;
  /**
   * READ-ONLY executor surface only — `invokeRead`. The mutating
   * `invokeIntent` is intentionally not part of this contract: a READ may
   * never reach it. K/P do not appear in `invokeRead`, so this is generic over
   * state only (no cast needed at the call site).
   */
  readonly executor: Pick<AdopterExecutor<string, unknown, S>, "invokeRead">;
  /** Pack taint policy — the read envelope is adjudicated against it. */
  readonly taint: TaintPolicy;
  /**
   * Required durable AuditSink (013/T1). The READ path crosses the same audited
   * kernel as intents — a missing sink is a construction-time type error, never a
   * silent `noopAuditSink()` no-op (invariant #6).
   */
  readonly auditSink: AuditSink;
  readonly ledger?: Ledger;
  /**
   * Required tenant RuntimeContext (013/T3). Non-optional so the kernel
   * kill-switch is ALWAYS consulted on the READ path — an omitted control no
   * longer skips the check (§C: friction, never bypass). The adapter resolves it
   * to the process-wide default context when no tenant context is supplied.
   */
  readonly runtimeContext: RuntimeContext;
  /** Plan snapshot accessor for the audit row (observability). */
  readonly plan: () => {
    readonly visibleReadTools: ReadonlyArray<string>;
    readonly allowedIntents: ReadonlyArray<string>;
  };
  /** Deterministic nonce derivation, mirroring the intent path. */
  readonly nonce: string;
  /** History snapshot is unused by READs but kept for shape symmetry. */
  readonly historySnapshot: H;
}

/**
 * 012 / T3 — route a classified READ through the audited kernel.
 *
 * Builds the read envelope (kind = read tool name, taint UNTRUSTED — reads are
 * model-originated, so they inherit the same untrusted provenance as intents),
 * crosses `adjudicateAndAudit`, and serves the read via `invokeRead` ONLY on a
 * kernel `EXECUTE`. A non-EXECUTE Decision (REFUSE on taint/kill/replay)
 * surfaces a tool result and never touches the executor — there is no direct,
 * unadjudicated `invokeRead` dispatch anywhere on this path.
 */
export async function routeReadThroughKernel<S, H>(
  ctx: RouteReadContext<S, H>,
): Promise<{
  readonly toolResult: ToolResultBlock;
  readonly extraEvents: ReadonlyArray<AgentEvent>;
  /**
   * 042 — true when the READ was authorized AND `invokeRead` actually returned
   * a datum that was reflected into the model's context (the laundering leg).
   * The loop folds this into the session contamination flag (treating the
   * returned data as `Retrieved` origin) when contamination is enabled. A
   * refused/kill-switched read or an executor error did NOT introduce an
   * untrusted datum, so it does not contaminate (`served: false`).
   */
  readonly served: boolean;
}> {
  const envelope = buildEnvelopeFromToolUse({
    intentKind: ctx.classification.name,
    payload: ctx.classification.input,
    sessionId: ctx.sessionId,
    taint: "UNTRUSTED",
    // 041 — READ bytes are also model-originated (012), so they carry the
    // same provenance source as intents: origin="LLM", stamped next to the
    // UNTRUSTED taint. Bound into the intentHash; gated by no guard in 041.
    origin: "LLM",
    nonce: ctx.nonce,
  });

  const events: AgentEvent[] = [{ kind: "intent_proposed", envelope }];

  const { decision } = await adjudicateAndAudit(
    envelope,
    ctx.state,
    readAuthorizationPolicy(ctx.taint),
    {
      sink: ctx.auditSink,
      ...(ctx.ledger !== undefined ? { ledger: ctx.ledger } : {}),
      context: ctx.runtimeContext,
      plan: () => ctx.plan(),
    },
  );
  events.push({ kind: "decision", decision, envelope });

  if (decision.kind !== "EXECUTE") {
    // Not authorized (taint / kill-switch / replay-suppression). The read is
    // NOT served — only a kernel EXECUTE reaches the executor (§D #1).
    const detail =
      decision.kind === "REFUSE"
        ? decision.refusal.userFacing
        : `Read not authorized (${decision.kind}).`;
    const result: ToolResultBlock = {
      toolUseId: ctx.toolUseId,
      content: detail,
      isError: true,
    };
    events.push({ kind: "tool_result", toolUseId: ctx.toolUseId, payload: result });
    return { toolResult: result, extraEvents: events, served: false };
  }

  // Authorized READ → serve via the READ-ONLY executor surface.
  let readResult: unknown;
  try {
    readResult = await ctx.executor.invokeRead(
      ctx.classification.name,
      ctx.classification.input,
      ctx.state,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "executor read failed";
    const errResult: ToolResultBlock = {
      toolUseId: ctx.toolUseId,
      content: `Tool failed: ${message}`,
      isError: true,
    };
    events.push({
      kind: "tool_result",
      toolUseId: ctx.toolUseId,
      payload: errResult,
    });
    // Executor threw — no datum entered context, so the session is not
    // contaminated by this read.
    return { toolResult: errResult, extraEvents: events, served: false };
  }

  const result: ToolResultBlock = {
    toolUseId: ctx.toolUseId,
    content: JSON.stringify({ ok: true, result: readResult }),
  };
  events.push({ kind: "handler_result", toolUseId: ctx.toolUseId, result: readResult });
  events.push({ kind: "tool_result", toolUseId: ctx.toolUseId, payload: result });
  // 042 — an authorized read served a datum into the model's context: this is
  // the laundering leg. The loop contaminates the session on `served: true`.
  return { toolResult: result, extraEvents: events, served: true };
}

export { AdapterError, AdapterErrorCode };
