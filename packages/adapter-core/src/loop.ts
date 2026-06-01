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
import { adjudicateAndAudit } from "@adjudicate/core/kernel";
import { resumeDeferredIntent } from "@adjudicate/runtime";
import {
  buildEnvelopeFromToolUse,
  classifyIncomingToolUse,
} from "./bridge.js";
import {
  makeOutOfPlanToolResult,
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
      const plan = options.pack.planner.plan(state, context);
      const rendered = options.renderer.render(state, context, plan);

      const sent = await bridge.send(history, {
        systemPrompt: rendered.systemPrompt,
        maxTokens: rendered.maxTokens,
        toolSchemas: rendered.toolSchemas,
      });
      history = sent.history;

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
          events.push({ kind: "tool_result", toolUseId: tu.id, payload: result });
          continue;
        }

        if (cls.kind === "read") {
          let readResult: unknown;
          try {
            readResult = await options.executor.invokeRead(
              cls.name,
              cls.input,
              state,
            );
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "executor read failed";
            const errResult: ToolResultBlock = {
              toolUseId: tu.id,
              content: `Tool failed: ${message}`,
              isError: true,
            };
            toolResults.push(errResult);
            events.push({
              kind: "tool_result",
              toolUseId: tu.id,
              payload: errResult,
            });
            continue;
          }
          const result: ToolResultBlock = {
            toolUseId: tu.id,
            content: JSON.stringify({ ok: true, result: readResult }),
          };
          toolResults.push(result);
          events.push({
            kind: "handler_result",
            toolUseId: tu.id,
            result: readResult,
          });
          events.push({ kind: "tool_result", toolUseId: tu.id, payload: result });
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
          options.pack.policy,
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
      return runLoop(
        input.sessionId,
        initialHistory,
        input.state,
        input.context,
        seedEvents,
        null,
      );
    },

    async resume(args: ResumeArgs<S, C, H>) {
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
        options.pack.policy,
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
        options.pack.policy,
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
