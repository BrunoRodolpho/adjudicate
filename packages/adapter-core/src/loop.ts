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
  contaminateSession,
  mergeTaint,
  sha256Canonical,
  timingSafeHexEqual,
  type Decision,
  type IntentEnvelope,
  type SessionContamination,
  type Taint,
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
  runBudgetBurnDown,
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

/**
 * 024 — default capability TTL (seconds). The side effect happens in the SAME
 * turn, milliseconds after the mint, so a short window is correct: a capability
 * not redeemed almost immediately is stale. Fail-closed past TTL (§D #6).
 */
const DEFAULT_CAPABILITY_TTL_SECONDS = 60;

/**
 * 042 / H4 — TTL (seconds) for a persisted session-contamination flag. The flag
 * must outlive the turn that set it and survive across the subsequent turns that
 * re-supply the laundered history, so the window is long (matches the in-memory
 * memory-store default). Expiry only RAISES trust (drops the flag), so a too-
 * short window fails OPEN; a generous default keeps the gate fail-CLOSED for the
 * life of a normal multi-turn session. Adopters tune it on their store impl.
 */
const DEFAULT_CONTAMINATION_TTL_SECONDS = 24 * 60 * 60;

export function createAdjudicatedAgent<K extends string, P, S, C, H>(
  options: AdjudicatedAgentOptions<K, P, S, C, H>,
): AdjudicatedAgent<K, P, S, C, H> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const rk = options.rk ?? ((raw: string) => raw);
  const deriveNonce =
    options.deriveNonce ?? ((args) => args.toolUseId);
  const bridge = options.bridge;
  const traceSink = options.traceSink ?? noopTraceSink;

  // 013/T1+T2: the AuditSink is REQUIRED — the prior fail-open no-op default is
  // removed. Thread the supplied sink verbatim to every kernel crossing.
  const auditSink = options.auditSink;
  // 013/T3 (adapter seam): the tenant kill-switch must be NON-OPTIONAL — an
  // omitted RuntimeContext no longer skips the kernel kill-switch check. Resolve
  // to the process-wide default context (whose killSwitch is non-killed unless an
  // operator engages it) so the guard is ALWAYS consulted, never bypassed (§C:
  // failure defaults to friction, never bypass). The config-seal path already
  // uses this same default to ENGAGE the switch (line ~150).
  const runtimeContext = options.runtimeContext ?? getDefaultRuntimeContext();

  // 042 — session contamination is OFF unless the adopter opts in. When ON, an
  // untrusted-origin datum entering the session (an authorized READ result)
  // lowers the taint of every subsequently minted LLM intent via the lattice
  // meet. Cleared ONLY by the authenticated resume() path, never by an LLM
  // action.
  const contaminationEnabled = options.contamination?.enabled === true;
  // 042 / H4 — the durable cross-turn contamination store. The flag is SESSION-
  // scoped, but the laundered datum it guards lives on in session-scoped history
  // re-supplied across turns; persisting the flag here closes the multi-turn
  // launder (contaminate turn 1 → act turn 2). Only consulted when contamination
  // is ENABLED *and* a store is supplied — with either absent the loop keeps the
  // pre-H4 turn-local flag, byte-identical (no load / writeback / clear).
  const contaminationStore =
    contaminationEnabled ? options.contaminationStore : undefined;

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
      runtimeContext.killSwitch.set(true, "config_seal_mismatch");
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
    // 042 / H4 — session contamination flag. LOADED from the durable, session-
    // scoped store at the top of every runLoop so a flag set by an authorized
    // READ on an earlier turn is re-supplied alongside the (still session-scoped)
    // laundered history it guards — closing the multi-turn launder (contaminate
    // turn 1 → act turn 2) that the pre-H4 turn-local `undefined` start let slip
    // the origin gate. Folded monotonically within the turn (`contaminateSession`
    // only lowers trust) and PERSISTED back on each contaminating READ. Cleared
    // ONLY by the authenticated resume() path (see resume(), below), never by an
    // LLM action. When contamination is disabled OR no store is supplied,
    // `contaminationStore` is undefined and this stays `undefined` — no load, no
    // writeback — so the disabled/no-store path is byte-identical to pre-042.
    let sessionContamination: SessionContamination | undefined =
      contaminationStore !== undefined
        ? (await contaminationStore.get(sessionId)) ?? undefined
        : undefined;

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
            auditSink,
            ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
            runtimeContext,
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
          // 042 — the laundering leg: an authorized READ that SERVED a datum
          // reflected untrusted retrieved content back into the model's
          // context. Contaminate the session (treating the datum as `Retrieved`
          // / UNTRUSTED) so the NEXT minted LLM intent inherits the taint via
          // the lattice meet. Monotonic (`contaminateSession` only lowers
          // trust) and gated on the adopter opt-in.
          if (contaminationEnabled && readRouted.served) {
            const next = contaminateSession(sessionContamination, {
              origin: "Retrieved",
              taint: "UNTRUSTED",
            });
            // H4 — PERSIST the (monotonically meet-folded) flag so it survives
            // into the NEXT turn that re-supplies this laundered datum. We write
            // only when the fold actually produced a flag and it CHANGED (the
            // first contaminating read, or a strictly-lower meet), so a repeated
            // read on an already-contaminated session is a no-op write. The
            // value written is always ≤ the loaded flag in trust, so the store
            // mutation is monotonic (§C / invariant #7). Best-effort: a throwing
            // store must not break the turn nor fail OPEN — the in-turn flag is
            // already folded, so this turn's gate stands regardless.
            if (
              contaminationStore !== undefined &&
              next !== undefined &&
              next !== sessionContamination
            ) {
              try {
                await contaminationStore.put(
                  sessionId,
                  next,
                  DEFAULT_CONTAMINATION_TTL_SECONDS,
                );
              } catch (err) {
                options.log?.warn?.({
                  msg: "[adjudicate] contamination writeback failed; in-turn flag stands, cross-turn persistence skipped",
                  sessionId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
            sessionContamination = next;
          }
          continue;
        }

        // cls.kind === "intent"
        // 041 — stamp the provenance SOURCE axis at the single site where
        // LLM-proposed `tool_use` bytes become an envelope. These bytes were
        // proposed by the model, so the DECLARED origin = "LLM" (the harness
        // default), declared next to taint:"UNTRUSTED".
        //
        // 042 — fold the per-turn session contamination flag into the minted
        // taint via the lattice meet at this single envelope-minting seam,
        // replacing the former unconditional `"UNTRUSTED"` literal. The meet is
        // monotonic (`mergeTaint` only lowers trust, never raises it), so a
        // contaminated session can only ADD friction; a clean session
        // (`undefined` flag) yields exactly the declared taint, byte-identical
        // to pre-042. The fold happens BEFORE `buildEnvelopeFromToolUse` hashes,
        // so the contaminated taint is inside the intentHash pre-image (#4) —
        // an LLM cannot post-hoc flip it. `buildEnvelopeFromToolUse` also stamps
        // the contaminating origin (when the flag is set) so a contamination-
        // lowered refusal is attributed `taint:propagation_violation`.
        const declaredTaint: Taint = "UNTRUSTED";
        const mintedTaint = mergeTaint(
          declaredTaint,
          sessionContamination?.taint ?? declaredTaint,
        );
        const envelope = buildEnvelopeFromToolUse({
          intentKind: cls.intentKind,
          payload: cls.payload,
          sessionId,
          taint: mintedTaint,
          origin: "LLM",
          ...(sessionContamination !== undefined
            ? { contamination: sessionContamination }
            : {}),
          nonce: deriveNonce({
            sessionId,
            toolUseId: tu.id,
            payload: cls.payload,
          }),
        });
        events.push({ kind: "intent_proposed", envelope });

        const { decision, record: firstRecord } = await adjudicateAndAudit(
          envelope as IntentEnvelope<K, P>,
          state,
          sealedPolicy,
          {
            sink: auditSink,
            ledger: options.ledger,
            context: runtimeContext,
            plan: () => ({
              visibleReadTools: plan.visibleReadTools,
              allowedIntents: plan.allowedIntents,
            }),
          },
        );
        // 025 — capabilities-as-budgets: ONLY when the kernel asked for
        // confirmation, try to satisfy the threshold from a standing budget
        // grant. On a successful ATOMIC burn-down the loop re-adjudicates with
        // the kernel `budgetGrant` asserted, yielding a budget-satisfied EXECUTE
        // that supersedes the REQUEST_CONFIRMATION audit row. Any other outcome
        // (or no budget configured / over-limit) leaves `decision` untouched.
        let effectiveDecision = decision;
        if (decision.kind === "REQUEST_CONFIRMATION" && options.budget) {
          const budgeted = await tryBudgetSubstitution(
            envelope as IntentEnvelope<K, P>,
            state,
            sealedPolicy,
            plan,
            decision,
            // 025 (LogicReviewer): the predecessor REQUEST_CONFIRMATION row's
            // `at`. The budget-satisfied EXECUTE's supersedes.predecessorAt MUST
            // be this value (NOT the second call's clock), so the audit-chain
            // walker can JOIN the two records that share the envelope intentHash.
            firstRecord.at,
          );
          if (budgeted !== null) effectiveDecision = budgeted;
        }
        lastDecision = effectiveDecision;
        events.push({ kind: "decision", decision: effectiveDecision, envelope });
        traceSink.onTrace({
          phase: "decision_emitted",
          sessionId,
          iteration: iter + 1,
          decisionKind: effectiveDecision.kind,
        });

        const single = await processSingleDecision({
          decision: effectiveDecision,
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
      // 024 — cap-gated executor: mint the kernel-shell-signed, single-use
      // capability in the IMPURE shell AFTER the pure decision (§D: the kernel
      // decides; the shell signs + persists). Only EXECUTE / REWRITE reach the
      // executor (invariant #1), so we mint ONLY for those, keyed by the EFFECTIVE
      // envelope's nonce (the original for EXECUTE, the rewritten one for REWRITE)
      // — matching the nonce `runExecute` burns by. We sign over the effective
      // envelope's `intentHash` (which already content-addresses
      // kind+payload+taint+nonce+actor+origin, §D #4) and `mint` it into 022's
      // atomic store first-writer-wins. A failed mint (store error / duplicate
      // live key) leaves NO grant to burn → `runExecute` fail-closes (§D #6). The
      // gate is OFF by default, so this whole block is skipped and the seam is
      // byte-identical to pre-024.
      if (options.capabilityGate !== undefined) {
        await mintCapabilityForDecision(
          options.capabilityGate,
          args.decision,
          args.envelope,
          args.sessionId,
          args.toolUseId,
        );
      }
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
        // 024 — thread the cap gate so runExecute burns + verifies the minted
        // capability before invokeIntent (fail-closed). Absent → pre-024 seam.
        ...(options.capabilityGate !== undefined
          ? { capabilityGate: options.capabilityGate }
          : {}),
        // Item 1: resolve the per-kind executor output contract (if the Pack
        // declared one) so runExecute can validate the executor's output.
        // REWRITE is scope-restricted to payload sanitization and never changes
        // `kind` (the Decision contract; see core/decision.ts), so resolving by
        // the original envelope's kind is correct for both EXECUTE and REWRITE.
        executorContract: options.pack.executorContract?.[args.envelope.kind],
        // 023 — thread the resource-binding policy so runExecute re-verifies the
        // kernel-bound payload at the executor seam before `invokeIntent`
        // (anti-IDOR; defaults to "strict" inside runExecute). The constant-time
        // comparator the binding uses (`timingSafeHexEqual`) is wired at this seam.
        ...(options.resourceBindingPolicy !== undefined
          ? { resourceBindingPolicy: options.resourceBindingPolicy }
          : {}),
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

    /**
     * 024 — mint + sign the single-use capability for an EXECUTE / REWRITE
     * decision and persist it into 022's atomic burn store, keyed by the EFFECTIVE
     * envelope's nonce. Non-EXECUTE/REWRITE decisions never reach the executor, so
     * no capability is minted for them. The signer (`gate.mint`) is the injected
     * node-side ed25519 `signCapability`; adapter-core never imports
     * `@adjudicate/approval-engine` (that would be a dependency cycle).
     *
     * A throwing signer or store is swallowed here (best-effort mint): the grant
     * simply isn't present, so `runExecute`'s burn returns null and fail-closes
     * (§D #6 — no fail-open). We log it so the operator sees the cause.
     */
    async function mintCapabilityForDecision(
      gate: NonNullable<typeof options.capabilityGate>,
      decision: Decision,
      envelope: IntentEnvelope<K, P>,
      sessionId: string,
      toolUseId: string,
    ): Promise<void> {
      let effective: IntentEnvelope<K, P>;
      if (decision.kind === "EXECUTE") {
        effective = envelope;
      } else if (decision.kind === "REWRITE") {
        effective = decision.rewritten as IntentEnvelope<K, P>;
      } else {
        return;
      }
      try {
        const capability = await gate.mint({
          intentHash: effective.intentHash,
          kernelId: gate.kernelId,
        });
        const minted = await gate.burnStore.mint(
          effective.nonce,
          capability,
          gate.ttlSeconds ?? DEFAULT_CAPABILITY_TTL_SECONDS,
        );
        if (!minted) {
          // First-writer-wins suppressed the mint (a live grant already holds the
          // key — e.g. a replay within the TTL). `runExecute` will burn the
          // existing grant; if it doesn't match THIS envelope's intentHash the
          // bind check fail-closes. Log for visibility.
          options.log?.warn?.({
            msg: "[adjudicate] capability mint suppressed (live key); burn will fail-closed if it does not bind",
            sessionId,
            toolUseId,
            intentKind: effective.kind,
          });
        }
      } catch (err) {
        options.log?.warn?.({
          msg: "[adjudicate] capability mint/sign failed; executor seam will fail-closed",
          sessionId,
          toolUseId,
          intentKind: effective.kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    /**
     * 025 — capabilities-as-budgets: try to satisfy a REQUEST_CONFIRMATION from a
     * standing budget grant. The decrement-then-assert-grant authority flow:
     *   1. resolve the grant for the envelope's kind (host authority; no grant ⇒
     *      no substitution).
     *   2. ATOMICALLY burn down ONE unit against the grant's `limit` via the
     *      `evalIncrCheck` Lua primitive (`runBudgetBurnDown`, decisions.ts). The
     *      shell asserts the grant ONLY after a successful, in-budget decrement.
     *   3. RE-adjudicate with `deps.budgetGrant` asserted — the kernel substitutes
     *      EXECUTE + a `budget:satisfied` basis ONLY because the decision is still
     *      REQUEST_CONFIRMATION (state/taint/auth/business guards re-run; a state
     *      change since the first pass that flipped the outcome correctly stands).
     *      The re-adjudication's audit row supersedes the original via
     *      `budget_satisfied`.
     * Returns the substituted Decision, or `null` when no substitution happened
     * (no grant, over-limit / store error, or the re-adjudication did not EXECUTE
     * — friction-preserving, fail-closed §C/§D #6).
     */
    async function tryBudgetSubstitution(
      envelope: IntentEnvelope<K, P>,
      state: S,
      sealedPolicy: typeof options.pack.policy,
      plan: { visibleReadTools: ReadonlyArray<string>; allowedIntents: ReadonlyArray<string> },
      original: Decision,
      // 025 (LogicReviewer): the `at` of the predecessor REQUEST_CONFIRMATION
      // audit row (the first-pass `adjudicateAndAudit` record). Threaded into the
      // kernel as `budgetGrant.originalAt` so the budget-satisfied EXECUTE's
      // `supersedes.predecessorAt` points at the predecessor's `at`, not the
      // second call's `clock.nowIso()`. Required for `buildSupersessionChains` to
      // reconstruct the chain instead of emitting a false cycle/singleton.
      originalAt: string,
    ): Promise<Decision | null> {
      const budget = options.budget;
      if (!budget) return null;
      let grant;
      try {
        grant = await budget.resolveGrant(envelope.kind);
      } catch (err) {
        options.log?.warn?.({
          msg: "[adjudicate] budget grant resolver threw; leaving REQUEST_CONFIRMATION standing (fail-closed)",
          intentKind: envelope.kind,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
      // No standing budget covers this kind, or the resolver mis-mapped the kind:
      // leave the REQUEST_CONFIRMATION (friction-preserving). The kind guard here
      // mirrors the kernel's own `grant.intentKind === envelope.kind` check.
      if (grant === undefined || grant.intentKind !== envelope.kind) return null;
      // Atomic burn-down. Over-limit / no atomic primitive / store error ⇒ false
      // ⇒ leave the REQUEST_CONFIRMATION standing (fail-closed to friction).
      const inBudget = await runBudgetBurnDown({
        store: budget.store,
        grant,
        rk,
        ...(options.log !== undefined ? { log: options.log } : {}),
      });
      if (!inBudget) {
        options.log?.info?.({
          msg: "[adjudicate] budget exhausted or unavailable; REQUEST_CONFIRMATION stands",
          intentKind: envelope.kind,
          budgetId: grant.budgetId,
        });
        return null;
      }
      // In-budget: re-adjudicate with the grant asserted. The kernel substitutes
      // EXECUTE + budget basis ONLY if the decision is STILL REQUEST_CONFIRMATION.
      const { decision: substituted } = await adjudicateAndAudit(
        envelope,
        state,
        sealedPolicy,
        {
          sink: auditSink,
          ledger: options.ledger,
          context: runtimeContext,
          plan: () => ({
            visibleReadTools: plan.visibleReadTools,
            allowedIntents: plan.allowedIntents,
          }),
          // 025 (LogicReviewer): assert the grant AND the predecessor row's `at`
          // so the auto-derived `budget_satisfied` supersedes.predecessorAt joins
          // the original REQUEST_CONFIRMATION row (not this EXECUTE row's own at).
          budgetGrant: { ...grant, originalAt },
        },
      );
      void original;
      return substituted;
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
          sink: auditSink,
          ledger: options.ledger,
          context: runtimeContext,
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

      // 042 / H4 — CLEAR the persisted session contamination on the AUTHENTICATED
      // resume() path (the only trust-RAISING seam). resume() has already
      // validated a parked envelope for this (sessionId, signal) and elevated to
      // {actor: system, taint: TRUSTED}; an adopter-driven resume is the explicit
      // "this session is clean again" signal. An LLM action can never reach this
      // path. Done BEFORE runLoop so the resumed turn (and every turn after) loads
      // a clean flag. Best-effort: a throwing store leaves the flag standing
      // (fail-CLOSED — friction never decreases on a clear failure, §C).
      if (contaminationStore !== undefined) {
        try {
          await contaminationStore.clear(args.sessionId);
        } catch (err) {
          options.log?.warn?.({
            msg: "[adjudicate] contamination clear on resume failed; flag left standing (fail-closed)",
            sessionId: args.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

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
          // 041 — origin joined the intentHash recipe; include it so a clean
          // (untampered) confirmation blob re-derives byte-identically.
          origin: pending.envelope.origin,
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
          sink: auditSink,
          ledger: options.ledger,
          context: runtimeContext,
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
            // 071: forward the bound (capability, approver, channel) tuple the
            // caller resolved this confirmation with. The pending envelope was
            // already taken (single-use) and hash-verified above; the kernel
            // additionally gates the override on (and records into the
            // supersession) this tuple. Conditionally spread so omitting it is
            // byte-identical to pre-071 confirm() (§D-5).
            ...(args.binding !== undefined ? { binding: args.binding } : {}),
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
