/**
 * `createAdjudicatedAgent` — the provider-neutral message-loop orchestrator.
 *
 * Wires the planner, renderer, provider bridge, kernel, and Decision
 * translator into a single send/resume/confirm surface.
 *
 * Invariants the loop preserves:
 * - `pack.planner.plan(state, context)` is called every iteration. State
 *   may change mid-turn (a refund executes, freeing a previously-locked
 *   tool); the visible-tool surface MUST update accordingly.
 * - The Pack passed in MUST already be `safePlan` + `withBasisAudit`
 *   wrapped (Pack-author convention). The loop does NOT double-wrap.
 * - Every intent envelope crosses `adjudicateAndAudit()` from
 *   `@adjudicate/core/kernel`. The loop never bypasses the kernel,
 *   never raises taint, and never short-circuits the guard ordering.
 * - First non-continue Decision wins: subsequent tool_use blocks in the
 *   same assistant turn are surfaced as `not_processed_due_to_pause`.
 * - History `H` is opaque. The bridge is the only thing that knows the
 *   conversation-history shape; the loop threads it.
 */

import {
  buildEnvelope,
  noopAuditSink,
  sha256Canonical,
  timingSafeHexEqual,
  type Decision,
  type IntentEnvelope,
} from "@adjudicate/core";
import { adjudicateAndAudit, getDefaultRuntimeContext } from "@adjudicate/core/kernel";
import {
  extractSealableSurface,
  freezeSealableSurface,
  verifyConfigSeal,
  verifyConfigSealFrozen,
  type ConfigSealReport,
  type SealableSurface,
  type SealablePackInput,
} from "@adjudicate/conformance";
import { resumeDeferredIntent } from "@adjudicate/runtime";
import {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
} from "./bridge.js";
import {
  makeOutOfPlanToolResult,
  routeReadThroughKernel,
  translateDecision,
  type LoopAction,
} from "./decisions.js";
import { AdapterError, AdapterErrorCode } from "./errors.js";
import { noopTraceSink, type AdapterPauseReason } from "./trace.js";
import type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AgentEvent,
  AgentOutcome,
  AgentTurnResult,
  ConfirmArgs,
  ResumeArgs,
  SendInput,
  ToolResultBlock,
} from "./types.js";

const DEFAULT_MAX_ITERATIONS = 8;

export function createAdjudicatedAgent<K extends string, P, S, C, H>(
  options: AdjudicatedAgentOptions<K, P, S, C, H>,
): AdjudicatedAgent<K, P, S, C, H> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const rk = options.rk ?? ((raw: string) => raw);
  const deriveNonce =
    options.deriveNonce ?? ((args) => args.toolUseId);
  const bridge = options.bridge;
  const traceSink = options.traceSink ?? noopTraceSink;

  // Configuration-integrity seal gate (ADR-121, hardened by ADR-137). Verified at
  // the START of every public entry point (send/resume/confirm) per the `reverify`
  // cadence (default every_turn), upstream of adjudicate() and never a kernel
  // input. Kills the old boot-only latch so a post-boot reference-swap is caught.
  // The verified `options.pack.policy` reference is then SNAPSHOTTED and reused for
  // every adjudication in the turn, so a mid-turn reference-swap (between the check
  // and a kernel read, or between loop iterations) cannot affect the decision —
  // closing the verify→read TOCTOU. On mismatch the turn is refused.
  let frozenSurface: Readonly<SealableSurface> | null = null;
  let sealCachedReport: { report: ConfigSealReport; atMs: number } | null = null;
  let sealWarned = false;

  function sealVerifyOptions() {
    const cfg = options.configSeal!;
    return {
      ...(cfg.publicKeyPem !== undefined ? { publicKeyPem: cfg.publicKeyPem } : {}),
      ...(cfg.policy !== undefined ? { policy: cfg.policy } : {}),
    };
  }

  function checkConfigSeal(sessionId: string): AgentTurnResult<H> | null {
    const cfg = options.configSeal;
    if (!cfg) return null;

    // L1 deprecation warning (once per instance): defaults are still lax.
    if (!sealWarned) {
      sealWarned = true;
      const unsigned = cfg.policy !== "require_signature" || cfg.publicKeyPem === undefined;
      if (unsigned || cfg.engageKillSwitchOnMismatch !== true) {
        options.log?.warn?.({
          msg:
            "config seal: lax defaults (deprecation) — a future release defaults to " +
            "require_signature + engageKillSwitchOnMismatch=true. Set them explicitly.",
          unsigned,
          killSwitchOnMismatch: cfg.engageKillSwitchOnMismatch === true,
        });
      }
    }

    const pack = options.pack as unknown as SealablePackInput;
    const mode = cfg.reverify ?? "every_turn";
    let report: ConfigSealReport;
    if (mode === "frozen") {
      if (frozenSurface === null) {
        frozenSurface = freezeSealableSurface(extractSealableSurface(pack));
      }
      report = verifyConfigSealFrozen(frozenSurface, cfg.seal, sealVerifyOptions());
    } else if (typeof mode === "object") {
      // {ttlMs}: amortize live re-verification via a loop-layer clock (never the kernel).
      const now = Date.now();
      if (sealCachedReport !== null && now - sealCachedReport.atMs < mode.ttlMs) {
        report = sealCachedReport.report;
      } else {
        report = verifyConfigSeal(pack, cfg.seal, sealVerifyOptions());
        sealCachedReport = { report, atMs: now };
      }
    } else {
      report = verifyConfigSeal(pack, cfg.seal, sealVerifyOptions());
    }

    if (report.verified) return null;

    // Drift: tamper-evident hook + optional kill latch + refuse the turn. Not
    // latched across turns — once the pack/seal is fixed, every_turn self-heals.
    try {
      cfg.onDrift?.(report);
    } catch {
      /* best-effort telemetry */
    }
    if (cfg.engageKillSwitchOnMismatch) {
      const ctx = options.runtimeContext ?? getDefaultRuntimeContext();
      ctx.killSwitch.set(true, "config_seal_mismatch");
    }
    traceSink.onTrace({ phase: "config_seal_violation", sessionId, iteration: 0 });
    options.log?.warn?.({ msg: "config seal mismatch — refusing turn", detail: report.errors.join("; ") });
    return {
      events: [],
      history: bridge.emptyHistory(),
      outcome: { kind: "refused", reason: "config_seal_mismatch", detail: report.errors.join("; ") },
    };
  }

  // ADR-126: fold cross-session memory into the planner/renderer context.
  // Returns baseContext unchanged when no store/enricher is configured.
  async function resolveContext(sessionId: string, baseContext: C): Promise<C> {
    if (!options.memoryStore || !options.enrichContext) return baseContext;
    const memory = await options.memoryStore.get(sessionId);
    return options.enrichContext(baseContext, memory);
  }

  // Optional best-effort post-turn writeback (outside the decision path).
  // When the store supports CAS (getVersioned/putIfVersion), use it with a
  // bounded retry-on-conflict so concurrent turns on the same session don't
  // clobber each other; otherwise fall back to the read→derive→put path.
  async function writeMemoryback(
    sessionId: string,
    baseContext: C,
    result: AgentTurnResult<H>,
  ): Promise<void> {
    const store = options.memoryStore;
    const derive = options.deriveMemoryWriteback;
    if (!store || !derive) return;
    const MAX_CAS_RETRIES = 3;
    try {
      if (store.getVersioned && store.putIfVersion) {
        for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
          const { value: prior, version } = await store.getVersioned(sessionId);
          const patch = derive({ sessionId, baseContext, priorMemory: prior, result });
          if (patch === null) return;
          const newVersion = await store.putIfVersion(sessionId, patch.memory, version, patch.ttlSeconds);
          if (newVersion !== null) return; // committed
          // null → version conflict: another writer won; re-read and retry.
        }
        options.log?.warn?.({ msg: "memory writeback CAS exhausted retries; skipping", sessionId });
        return;
      }
      const prior = await store.get(sessionId);
      const patch = derive({ sessionId, baseContext, priorMemory: prior, result });
      if (patch !== null) await store.put(sessionId, patch.memory, patch.ttlSeconds);
    } catch (err) {
      options.log?.warn?.({ msg: "memory writeback failed; ignoring", error: err instanceof Error ? err.message : String(err) });
    }
  }

  function pauseActionToReason(kind: LoopAction["kind"]): AdapterPauseReason | undefined {
    switch (kind) {
      case "pause_for_defer":
        return "deferred";
      case "pause_for_user_confirmation":
        return "awaiting_confirmation";
      case "complete_for_escalation":
        return "escalated";
      default:
        return undefined;
    }
  }

  async function runLoop(
    sessionId: string,
    initialHistory: H,
    state: S,
    context: C,
    seedEvents: ReadonlyArray<AgentEvent>,
    /**
     * Optional pre-seeded Decision injected before the first provider
     * call — used by `confirm()` and `resume()` to splice an authoritative
     * Decision (from the user's confirmation or the resumed envelope) back
     * into the conversation without consulting the LLM again first.
     */
    seedDecision: SeedDecision<K, P> | null,
  ): Promise<AgentTurnResult<H>> {
    // Configuration-integrity gate (ADR-121): refuse before any adjudication
    // when the installed Pack config has drifted from its signed seal.
    const sealResult = checkConfigSeal(sessionId);
    if (sealResult !== null) return sealResult;
    // Snapshot the verified policy reference so every adjudication this turn uses
    // exactly what was sealed — a mid-turn `options.pack.policy` swap is ignored.
    const sealedPolicy = options.pack.policy;

    const events: AgentEvent[] = [...seedEvents];
    let history = initialHistory;
    let lastDecision: Decision | null = null;

    if (seedDecision !== null) {
      const single = await processSingleDecision({
        decision: seedDecision.decision,
        envelope: seedDecision.envelope,
        toolUseId: seedDecision.toolUseId,
        sessionId,
        state,
        historySnapshot: history,
      });
      lastDecision = seedDecision.decision;
      events.push(...single.events);
      if (single.toolResult !== null) {
        history = bridge.appendToolResults(history, [single.toolResult]);
      }
      if (single.loopAction.kind !== "continue") {
        return {
          events,
          history,
          outcome: pauseToOutcome(single.loopAction, lastDecision),
        };
      }
    }

    for (let iter = 0; iter < maxIterations; iter++) {
      traceSink.onTrace({
        phase: "iteration_start",
        sessionId,
        iteration: iter + 1,
      });
      // ADR-126: enrich the planner/renderer context with cross-session memory
      // ONCE per iteration. Both planner.plan and renderer.render see the SAME
      // enriched context (no prompt/plan desync). Memory flows ONLY here —
      // upstream of envelope construction — never into the kernel decision.
      const effectiveContext = await resolveContext(sessionId, context);
      const plan = options.pack.planner.plan(state, effectiveContext);
      const rendered = options.renderer.render(state, effectiveContext, plan);

      const sent = await bridge.send(history, {
        systemPrompt: rendered.systemPrompt,
        maxTokens: rendered.maxTokens,
        toolSchemas: rendered.toolSchemas,
      });
      history = sent.history;

      // Surface provider token usage (ADR-120) so the adopter can fold a
      // cumulative counter into the next state S (where a token-budget guard
      // reads it). Side-effect-only and defensive — a throwing observer must
      // not break the loop.
      if (options.onTokenUsage) {
        try {
          options.onTokenUsage({
            sessionId,
            iteration: iter + 1,
            usage: sent.turn.usage,
          });
        } catch (err) {
          options.log?.warn?.({
            msg: "onTokenUsage threw; ignoring",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      for (const text of sent.turn.textBlocks) {
        events.push({ kind: "assistant_text", text });
      }

      if (sent.turn.toolUses.length === 0) {
        traceSink.onTrace({
          phase: "completed",
          sessionId,
          iteration: iter + 1,
        });
        return {
          events,
          history,
          outcome: {
            kind: "completed",
            assistantText: sent.turn.textBlocks.join(""),
          },
        };
      }

      const toolResults: ToolResultBlock[] = [];
      let pauseAction: LoopAction | null = null;

      for (const tu of sent.turn.toolUses) {
        events.push({
          kind: "tool_use",
          toolUseId: tu.id,
          toolName: tu.name,
          input: tu.input,
        });

        if (pauseAction !== null) {
          // First non-continue Decision wins: surface remaining tool_uses
          // as not-processed so the LLM (on resume) understands they were
          // skipped this turn.
          toolResults.push({
            toolUseId: tu.id,
            content: "Not processed: prior tool_use paused this turn.",
            isError: true,
          });
          continue;
        }

        const cls = classifyIncomingToolUse(
          { name: tu.name, input: tu.input },
          plan,
        );

        if (cls.kind === "out_of_plan") {
          const result = makeOutOfPlanToolResult(tu.id, tu.name);
          toolResults.push(result);
          // Item 7: the agent caught an out-of-plan tool call. Emit a
          // tool_blocked event and (guarded) notify onCatch so a CatchUsageStore
          // can count it. This branch never builds an envelope or reaches
          // adjudicateAndAudit, so it cannot touch hashed bytes; a throwing
          // onCatch must not alter loop control flow (mirror onTokenUsage).
          events.push({
            kind: "tool_blocked",
            toolUseId: tu.id,
            toolName: tu.name,
            reason: "out_of_plan",
          });
          if (options.onCatch) {
            try {
              options.onCatch({
                sessionId,
                toolUseId: tu.id,
                toolName: tu.name,
                reason: "out_of_plan",
              });
            } catch (err) {
              options.log?.warn?.({
                msg: "onCatch threw; ignoring",
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          events.push({ kind: "tool_result", toolUseId: tu.id, payload: result });
          continue;
        }

        if (cls.kind === "read") {
          // 012: the unadjudicated READ fast-path is GONE. A model-proposed
          // READ no longer dispatches straight to `invokeRead` — it builds an
          // envelope and crosses `adjudicateAndAudit` (taint gate + audit sink
          // + ledger), and `invokeRead` runs ONLY on a kernel EXECUTE. Read-
          // only-ness is the typed `ToolClassification` (`cls.kind === "read"`),
          // a structural claim, not a re-derived wire-name guess.
          const readRouted = await routeReadThroughKernel({
            classification: cls,
            toolUseId: tu.id,
            sessionId,
            state,
            executor: options.executor,
            taint: sealedPolicy.taint,
            ...(options.auditSink !== undefined
              ? { auditSink: options.auditSink }
              : {}),
            ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
            ...(options.runtimeContext !== undefined
              ? { runtimeContext: options.runtimeContext }
              : {}),
            plan: () => ({
              visibleReadTools: plan.visibleReadTools,
              allowedIntents: plan.allowedIntents,
            }),
            nonce: deriveNonce({
              sessionId,
              toolUseId: tu.id,
              payload: cls.input,
            }),
            historySnapshot: history,
          });
          toolResults.push(readRouted.toolResult);
          events.push(...readRouted.extraEvents);
          continue;
        }

        // cls.kind === "intent"
        const envelope = buildEnvelopeFromToolUse({
          intentKind: cls.intentKind,
          payload: cls.payload,
          sessionId,
          taint: "UNTRUSTED",
          nonce: deriveNonce({
            sessionId,
            toolUseId: tu.id,
            payload: cls.payload,
          }),
        });
        events.push({ kind: "intent_proposed", envelope });

        const { decision } = await adjudicateAndAudit(
          envelope as IntentEnvelope<K, P>,
          state,
          sealedPolicy,
          {
            sink: options.auditSink ?? noopAuditSink(),
            ledger: options.ledger,
            context: options.runtimeContext,
            plan: () => ({
              visibleReadTools: plan.visibleReadTools,
              allowedIntents: plan.allowedIntents,
            }),
          },
        );
        lastDecision = decision;
        events.push({ kind: "decision", decision, envelope });
        traceSink.onTrace({
          phase: "decision_emitted",
          sessionId,
          iteration: iter + 1,
          decisionKind: decision.kind,
        });

        const single = await processSingleDecision({
          decision,
          envelope: envelope as IntentEnvelope<K, P>,
          toolUseId: tu.id,
          sessionId,
          state,
          historySnapshot: history,
        });
        events.push(...single.events);
        if (single.toolResult) toolResults.push(single.toolResult);
        if (single.loopAction.kind !== "continue") {
          pauseAction = single.loopAction;
        }
      }

      if (toolResults.length > 0) {
        history = bridge.appendToolResults(history, toolResults);
      }

      if (pauseAction !== null) {
        const reason = pauseActionToReason(pauseAction.kind);
        traceSink.onTrace({
          phase: "paused",
          sessionId,
          iteration: iter + 1,
          ...(reason !== undefined ? { pauseReason: reason } : {}),
          ...(lastDecision !== null
            ? { decisionKind: lastDecision.kind }
            : {}),
        });
        return {
          events,
          history,
          outcome: pauseToOutcome(pauseAction, lastDecision),
        };
      }
    }

    traceSink.onTrace({
      phase: "max_iterations_exceeded",
      sessionId,
      iteration: maxIterations,
      ...(lastDecision !== null ? { decisionKind: lastDecision.kind } : {}),
    });
    return {
      events,
      history,
      outcome: { kind: "max_iterations_exceeded", lastDecision },
    };

    type ProcessResult = {
      events: AgentEvent[];
      toolResult: ToolResultBlock | null;
      loopAction: LoopAction;
    };
    async function processSingleDecision(args: {
      decision: Decision;
      envelope: IntentEnvelope<K, P>;
      toolUseId: string;
      sessionId: string;
      state: S;
      historySnapshot: H;
    }): Promise<ProcessResult> {
      const t = await translateDecision({
        decision: args.decision,
        envelope: args.envelope,
        toolUseId: args.toolUseId,
        sessionId: args.sessionId,
        state: args.state,
        executor: options.executor,
        deferStore: options.deferStore,
        confirmationStore: options.confirmationStore,
        historySnapshot: args.historySnapshot,
        rk,
        log: options.log,
        // Item 1: resolve the per-kind executor output contract (if the Pack
        // declared one) so runExecute can validate the executor's output.
        // REWRITE is scope-restricted to payload sanitization and never changes
        // `kind` (the Decision contract; see core/decision.ts), so resolving by
        // the original envelope's kind is correct for both EXECUTE and REWRITE.
        executorContract: options.pack.executorContract?.[args.envelope.kind],
        // SecurityReviewer-003: the confirmation token is a single-use
        // credential authorizing REQUEST_CONFIRMATION → EXECUTE substitution.
        // Never fall back to Math.random() (V8 xorshift-128+ is reversible) —
        // fail hard if a CSPRNG is unavailable.
        generateToken: (): string => {
          if (typeof globalThis.crypto?.randomUUID !== "function") {
            throw new Error(
              "[adjudicate] crypto.randomUUID is unavailable. " +
                "Node ≥ 14.17 or a standards-compliant browser is required. " +
                "Do not polyfill with Math.random() for confirmation tokens.",
            );
          }
          return globalThis.crypto.randomUUID();
        },
      });
      return {
        events: [...t.extraEvents],
        toolResult: t.toolResult,
        loopAction: t.loopAction,
      };
    }
  }

  return {
    async send(input: SendInput<S, C, H>) {
      const baseHistory = input.history ?? bridge.emptyHistory();
      const initialHistory = bridge.appendUserMessage(
        baseHistory,
        input.userMessage,
      );
      const seedEvents: AgentEvent[] = [
        { kind: "user_message", text: input.userMessage },
      ];
      const result = await runLoop(
        input.sessionId,
        initialHistory,
        input.state,
        input.context,
        seedEvents,
        null,
      );
      await writeMemoryback(input.sessionId, input.context, result);
      return result;
    },

    async resume(args: ResumeArgs<S, C, H>) {
      // Config-seal gate BEFORE the resume adjudication (the elevated system/
      // TRUSTED envelope below). Without this, resume() adjudicated + committed an
      // audit/ledger record against a never-seal-verified policy. runLoop re-checks
      // for its own iterations.
      const resumeSeal = checkConfigSeal(args.sessionId);
      if (resumeSeal !== null) return resumeSeal;
      const sealedPolicy = options.pack.policy;
      const result = await resumeDeferredIntent({
        sessionId: args.sessionId,
        signal: args.signal,
        redis: options.deferStore,
        rk,
        log: options.log,
        verifyHash: options.verifyParkedHash ?? "strict",
      });
      if (!result.resumed || !result.parked) {
        throw new AdapterError(
          AdapterErrorCode.RESUME_NO_PARKED,
          `No parked envelope for session "${args.sessionId}" and signal "${args.signal}" (reason: ${result.reason ?? "unknown"})`,
          { sessionId: args.sessionId, signal: args.signal, reason: result.reason },
        );
      }

      // AuthReviewer-003: build the resume envelope via `buildEnvelope` so its
      // `intentHash` is re-derived from the elevated `{actor: system, taint:
      // TRUSTED}` fields. A hand-built literal that copied the stale parked
      // hash is rejected by the kernel's content-addressing check
      // (SECURITY / intent_hash_mismatch) on every resume. The `nonce` stays
      // the original parked hash so retried resumes hit ledger dedup, and the
      // original hash is preserved as the `supersedes` link below.
      const predecessorIntentHash = result.parked.envelope.intentHash;
      const envelope = buildEnvelope({
        kind: result.parked.envelope.kind as K,
        payload: result.parked.envelope.payload as P,
        nonce: predecessorIntentHash,
        actor: {
          principal: "system",
          sessionId: result.parked.envelope.actor.sessionId,
        },
        taint: "TRUSTED",
        // createdAt defaults to now() — fine for resume (not hash-derived).
      });
      const resumePlan = options.pack.planner.plan(args.state, args.context);
      const { decision } = await adjudicateAndAudit(
        envelope,
        args.state,
        sealedPolicy,
        {
          sink: options.auditSink ?? noopAuditSink(),
          ledger: options.ledger,
          context: options.runtimeContext,
          plan: () => ({
            visibleReadTools: resumePlan.visibleReadTools,
            allowedIntents: resumePlan.allowedIntents,
          }),
          supersedes: {
            predecessorIntentHash,
            // The parked-blob envelope shape (runtime ParkedEnvelope) carries
            // no `createdAt`; `parkedAt` is the ISO timestamp of the
            // predecessor park event — the correct supersession anchor.
            predecessorAt: result.parked.parkedAt,
            reason: "defer_resumed" as const,
          },
        },
      );

      const seedEvents: AgentEvent[] = [
        { kind: "intent_proposed", envelope },
        { kind: "decision", decision, envelope },
      ];

      const fauxToolUseId = `resume-${result.parked.envelope.intentHash.slice(0, 8)}`;
      const seedDecision: SeedDecision<K, P> = {
        decision,
        envelope,
        toolUseId: fauxToolUseId,
      };
      return runLoop(
        args.sessionId,
        args.history ?? bridge.emptyHistory(),
        args.state,
        args.context,
        seedEvents,
        seedDecision,
      );
    },

    async confirm(args: ConfirmArgs<S, C>) {
      const pending = await options.confirmationStore.take(
        args.confirmationToken,
      );
      if (pending === null) {
        throw new AdapterError(
          AdapterErrorCode.CONFIRMATION_TOKEN_INVALID,
          `Confirmation token "${args.confirmationToken}" is unknown or expired.`,
          { confirmationToken: args.confirmationToken },
        );
      }

      // Config-seal gate BEFORE the confirm adjudication (sessionId comes from the
      // taken envelope). Without this, confirm() adjudicated + committed an audit/
      // ledger record against a never-seal-verified policy. runLoop re-checks for
      // its own iterations; the verified policy is snapshotted for this turn.
      const confirmSeal = checkConfigSeal(pending.sessionId);
      if (confirmSeal !== null) return confirmSeal;
      const sealedPolicy = options.pack.policy;

      // SecurityReviewer-010: default strict (here warn/strict are equivalent —
      // this confirmation path has no missing-fields branch, only off-vs-verify).
      const verifyMode = options.verifyParkedHash ?? "strict";
      if (verifyMode !== "off") {
        const derived = sha256Canonical({
          version: pending.envelope.version,
          kind: pending.envelope.kind,
          payload: pending.envelope.payload,
          nonce: pending.envelope.nonce,
          actor: pending.envelope.actor,
          taint: pending.envelope.taint,
        });
        // Constant-time compare (P3-CRYPTO-TIMINGSAFE): a `!==` string compare
        // leaks via timing how many leading hex chars of a tampered intentHash
        // matched. timingSafeHexEqual is boolean-identical to `!==` here
        // (length-mismatch / non-hex → not equal) and never throws.
        if (!timingSafeHexEqual(derived, pending.envelope.intentHash)) {
          options.log?.warn?.(
            {
              sessionId: pending.sessionId,
              stored: pending.envelope.intentHash,
              derived,
              confirmationToken: args.confirmationToken,
            },
            "[adjudicated-agent] confirmation blob tampered — refusing to resume",
          );
          throw new AdapterError(
            AdapterErrorCode.CONFIRMATION_TOKEN_INVALID,
            `Confirmation token "${args.confirmationToken}" failed hash verification (envelope was modified after persistence).`,
            {
              confirmationToken: args.confirmationToken,
              reason: "confirmation_blob_tampered",
            },
          );
        }
      }

      if (!args.accepted) {
        const declineEvent: AgentEvent = {
          kind: "assistant_text",
          text: "User declined the confirmation. Action skipped.",
        };
        return {
          events: [declineEvent],
          history: pending.assistantHistorySnapshot,
          outcome: {
            kind: "completed" as const,
            assistantText: "User declined the confirmation. Action skipped.",
          },
        };
      }
      const envelope = pending.envelope as IntentEnvelope<K, P>;
      const confirmPlan = options.pack.planner.plan(args.state, args.context);
      const { decision } = await adjudicateAndAudit(
        envelope,
        args.state,
        sealedPolicy,
        {
          sink: options.auditSink ?? noopAuditSink(),
          ledger: options.ledger,
          context: options.runtimeContext,
          plan: () => ({
            visibleReadTools: confirmPlan.visibleReadTools,
            allowedIntents: confirmPlan.allowedIntents,
          }),
          confirmationReceipt: {
            intentHash: envelope.intentHash,
            at: new Date().toISOString(),
            // AuthReviewer-005: forward the single-use confirmation token into
            // the audit trail (Supersession.token) — a forensic record that
            // this confirmation came from a real token-exchange flow. The
            // adapter already verified it above via confirmationStore.take();
            // the kernel does not re-verify.
            token: args.confirmationToken,
          },
        },
      );
      const seedEvents: AgentEvent[] = [
        { kind: "intent_proposed", envelope },
        { kind: "decision", decision, envelope },
      ];
      const seedDecision: SeedDecision<K, P> = {
        decision,
        envelope,
        toolUseId: pending.toolUseId,
      };
      return runLoop(
        pending.sessionId,
        pending.assistantHistorySnapshot,
        args.state,
        args.context,
        seedEvents,
        seedDecision,
      );
    },
  };
}

interface SeedDecision<K extends string, P> {
  readonly decision: Decision;
  readonly envelope: IntentEnvelope<K, P>;
  readonly toolUseId: string;
}

function pauseToOutcome(
  action: LoopAction,
  lastDecision: Decision | null,
): AgentOutcome {
  switch (action.kind) {
    case "continue":
      return { kind: "max_iterations_exceeded", lastDecision };
    case "pause_for_user_confirmation":
      return {
        kind: "awaiting_confirmation",
        prompt: action.prompt,
        confirmationToken: action.token,
      };
    case "pause_for_defer":
      return {
        kind: "deferred",
        signal: action.signal,
        intentHash: action.intentHash,
      };
    case "complete_for_escalation":
      return {
        kind: "escalated",
        to: action.to,
        reason: action.reason,
      };
  }
}
