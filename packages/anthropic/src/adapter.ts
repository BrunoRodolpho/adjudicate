/**
 * `createAdjudicatedAgent` — the message-loop orchestrator.
 *
 * Wires the planner, renderer, Anthropic Messages API, kernel, and
 * Decision translator into a single send/resume/confirm surface.
 *
 * Invariants the loop preserves:
 * - `pack.planner.plan(state, context)` is called every iteration. State
 *   may change mid-turn (a refund executes, freeing a previously-locked
 *   tool); the visible-tool surface MUST update accordingly.
 * - The Pack passed in MUST already be `safePlan` + `withBasisAudit`
 *   wrapped (Pack-author convention). The adapter does NOT double-wrap.
 * - Every intent envelope crosses `adjudicate()` from
 *   `@adjudicate/core/kernel`. The adapter never bypasses the kernel,
 *   never raises taint, and never short-circuits the guard ordering.
 * - First non-continue Decision wins: subsequent tool_use blocks in the
 *   same assistant turn are surfaced as `not_processed_due_to_pause`.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import {
  adjudicate,
  buildAuditRecord,
  type Decision,
  type IntentEnvelope,
} from "@adjudicate/core";
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
import {
  AnthropicAdapterError,
  AnthropicAdapterErrorCode,
} from "./errors.js";
import type {
  AdjudicatedAgent,
  AdjudicatedAgentOptions,
  AdjudicatedAgentSendInput,
  AgentEvent,
  AgentOutcome,
  AgentTurnResult,
  ConfirmAgentArgs,
  ResumeAgentArgs,
} from "./types.js";

const DEFAULT_MAX_ITERATIONS = 8;

export function createAdjudicatedAgent<K extends string, P, S, C>(
  options: AdjudicatedAgentOptions<K, P, S, C>,
): AdjudicatedAgent<K, P, S, C> {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const rk = options.rk ?? ((raw: string) => raw);
  const deriveNonce =
    options.deriveNonce ??
    ((args) => args.toolUseId);

  async function runLoop(
    sessionId: string,
    initialHistory: ReadonlyArray<MessageParam>,
    state: S,
    context: C,
    seedEvents: ReadonlyArray<AgentEvent>,
    /**
     * Optional pre-seeded Decision injected before the first Anthropic
     * call — used by `confirm()` and `resume()` to splice an authoritative
     * Decision (from the user's confirmation or the resumed envelope) back
     * into the conversation without consulting the LLM again first.
     */
    seedDecision: SeedDecision<K, P> | null,
  ): Promise<AgentTurnResult> {
    const events: AgentEvent[] = [...seedEvents];
    let history: MessageParam[] = [...initialHistory];
    let lastDecision: Decision | null = null;

    if (seedDecision !== null) {
      const result = await processSingleDecision({
        decision: seedDecision.decision,
        envelope: seedDecision.envelope,
        toolUseId: seedDecision.toolUseId,
        sessionId,
        state,
        plan: seedDecision.plan,
      });
      lastDecision = seedDecision.decision;
      events.push(...result.events);
      if (result.toolResultMessage !== null) {
        history = [...history, result.toolResultMessage];
      }
      if (result.loopAction.kind !== "continue") {
        return {
          events,
          history,
          outcome: pauseToOutcome(result.loopAction, lastDecision),
        };
      }
    }

    for (let iter = 0; iter < maxIterations; iter++) {
      const plan = options.pack.planner.plan(state, context);
      const rendered = options.renderer.render(state, context, plan);

      const tools: Tool[] = rendered.toolSchemas.map((s) => ({
        name: s.name,
        description: s.description,
        input_schema: s.input_schema as Tool["input_schema"],
      }));

      const resp: Message = await options.anthropicClient.messages.create({
        model: options.model,
        max_tokens: rendered.maxTokens,
        system: rendered.systemPrompt,
        tools,
        messages: history as MessageParam[],
      });

      const toolUseBlocks = resp.content.filter(
        (b: ContentBlock): b is ToolUseBlock => b.type === "tool_use",
      );
      const textBlocks = resp.content.filter(
        (b: ContentBlock): b is Extract<ContentBlock, { type: "text" }> =>
          b.type === "text",
      );
      for (const t of textBlocks) {
        events.push({ kind: "assistant_text", text: t.text });
      }

      history = [...history, { role: "assistant", content: resp.content }];

      if (toolUseBlocks.length === 0) {
        return {
          events,
          history,
          outcome: {
            kind: "completed",
            assistantText: textBlocks.map((t) => t.text).join(""),
          },
        };
      }

      const toolResults: ToolResultBlockParam[] = [];
      let pauseAction: LoopAction | null = null;

      for (const tu of toolUseBlocks) {
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
            type: "tool_result",
            tool_use_id: tu.id,
            content: "Not processed: prior tool_use paused this turn.",
            is_error: true,
          });
          continue;
        }

        const cls = classifyIncomingToolUse({ name: tu.name, input: tu.input }, plan);

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
            const errResult: ToolResultBlockParam = {
              type: "tool_result",
              tool_use_id: tu.id,
              content: `Tool failed: ${message}`,
              is_error: true,
            };
            toolResults.push(errResult);
            events.push({
              kind: "tool_result",
              toolUseId: tu.id,
              payload: errResult,
            });
            continue;
          }
          const result: ToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ ok: true, result: readResult }),
          };
          toolResults.push(result);
          events.push({
            kind: "handler_result",
            toolUseId: tu.id,
            result: readResult,
          });
          events.push({
            kind: "tool_result",
            toolUseId: tu.id,
            payload: result,
          });
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

        const decision = adjudicate(
          envelope as IntentEnvelope<K, P>,
          state,
          options.pack.policy,
        );
        lastDecision = decision;
        events.push({ kind: "decision", decision, envelope });

        if (options.auditSink) {
          await options.auditSink.emit(
            buildAuditRecord({
              envelope,
              decision,
              durationMs: 0,
              plan: {
                visibleReadTools: plan.visibleReadTools,
                allowedIntents: plan.allowedIntents,
                forbiddenConcepts: plan.forbiddenConcepts,
              },
            }),
          );
        }

        const single = await processSingleDecision({
          decision,
          envelope: envelope as IntentEnvelope<K, P>,
          toolUseId: tu.id,
          sessionId,
          state,
          plan,
        });
        events.push(...single.events);
        if (single.toolResult) toolResults.push(single.toolResult);
        if (single.loopAction.kind !== "continue") {
          pauseAction = single.loopAction;
        }
      }

      if (toolResults.length > 0) {
        history = [...history, { role: "user", content: toolResults }];
      }

      if (pauseAction !== null) {
        return {
          events,
          history,
          outcome: pauseToOutcome(pauseAction, lastDecision),
        };
      }
    }

    return {
      events,
      history,
      outcome: { kind: "max_iterations_exceeded", lastDecision },
    };

    // ── inner helpers (closure over options) ────────────────────────────
    type ProcessResult = {
      events: AgentEvent[];
      toolResult: ToolResultBlockParam | null;
      toolResultMessage: MessageParam | null;
      loopAction: LoopAction;
    };
    async function processSingleDecision(args: {
      decision: Decision;
      envelope: IntentEnvelope<K, P>;
      toolUseId: string;
      sessionId: string;
      state: S;
      plan: import("@adjudicate/core/llm").Plan;
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
        historySnapshot: history,
        rk,
        log: options.log,
        generateToken: () =>
          (globalThis.crypto?.randomUUID?.() ??
            `ct-${Math.random().toString(36).slice(2)}-${Date.now()}`),
      });
      const collected: AgentEvent[] = [...t.extraEvents];
      const toolResultMessage: MessageParam | null = t.toolResult
        ? { role: "user", content: [t.toolResult] }
        : null;
      return {
        events: collected,
        toolResult: t.toolResult,
        toolResultMessage,
        loopAction: t.loopAction,
      };
    }
  }

  // ── public methods ────────────────────────────────────────────────────────

  return {
    async send(input: AdjudicatedAgentSendInput<S, C>) {
      const initialHistory: MessageParam[] = [
        ...(input.history ?? []),
        { role: "user", content: input.userMessage },
      ];
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

    async resume(args: ResumeAgentArgs<S, C>) {
      const result = await resumeDeferredIntent({
        sessionId: args.sessionId,
        signal: args.signal,
        redis: options.deferStore,
        rk,
        log: options.log,
      });
      if (!result.resumed || !result.parked) {
        throw new AnthropicAdapterError(
          AnthropicAdapterErrorCode.RESUME_NO_PARKED,
          `No parked envelope for session "${args.sessionId}" and signal "${args.signal}" (reason: ${result.reason ?? "unknown"})`,
          { sessionId: args.sessionId, signal: args.signal, reason: result.reason },
        );
      }

      // Reconstruct an envelope from the parked payload. This is the
      // adapter's reconstruction path; the kernel's hash invariant
      // requires that the adopter has preserved enough fields to
      // re-derive the same envelope. The runtime stored kind, actor,
      // payload, and intentHash; we need to wrap them so adjudicate()
      // can re-evaluate.
      //
      // Note: we adjudicate against the CURRENT state — that's the
      // entire point of resume: the world has moved (webhook arrived).
      const envelope: IntentEnvelope<K, P> = {
        version: 2,
        kind: result.parked.envelope.kind as K,
        payload: result.parked.envelope.payload as P,
        // createdAt is metadata; for a resumed envelope we use "now"
        // as a fresh wall-clock — it does not feed the hash.
        createdAt: new Date().toISOString(),
        // The parked record does not retain the original nonce; for
        // ledger-dedup purposes the resumed envelope's idempotency is
        // governed by `deferResumeHash` in the runtime's resume path.
        nonce: result.parked.envelope.intentHash,
        actor: {
          principal: "system",
          sessionId: result.parked.envelope.actor.sessionId,
        },
        // Resume-side envelopes are TRUSTED — they originate from the
        // signal source (e.g. payment provider webhook), not the LLM.
        taint: "TRUSTED",
        intentHash: result.parked.envelope.intentHash,
      };
      const decision = adjudicate(envelope, args.state, options.pack.policy);

      const seedEvents: AgentEvent[] = [
        { kind: "intent_proposed", envelope },
        { kind: "decision", decision, envelope },
      ];

      // For resumed flows the planner is consulted for the loop's
      // subsequent iterations; the seed Decision itself is processed
      // before the first LLM call. We synthesize a placeholder
      // toolUseId — there is no live Anthropic tool_use to correlate
      // with. The downstream tool_result is appended to the user-side
      // message as a system note for the LLM's continuation.
      const fauxToolUseId = `resume-${result.parked.envelope.intentHash.slice(0, 8)}`;
      const seedDecision: SeedDecision<K, P> = {
        decision,
        envelope,
        toolUseId: fauxToolUseId,
        plan: options.pack.planner.plan(args.state, args.context),
      };
      return runLoop(
        args.sessionId,
        args.history ?? [],
        args.state,
        args.context,
        seedEvents,
        seedDecision,
      );
    },

    async confirm(args: ConfirmAgentArgs<S, C>) {
      const pending = await options.confirmationStore.take(
        args.confirmationToken,
      );
      if (pending === null) {
        throw new AnthropicAdapterError(
          AnthropicAdapterErrorCode.CONFIRMATION_TOKEN_INVALID,
          `Confirmation token "${args.confirmationToken}" is unknown or expired.`,
          { confirmationToken: args.confirmationToken },
        );
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
            kind: "completed",
            assistantText: "User declined the confirmation. Action skipped.",
          },
        };
      }
      const envelope = pending.envelope as IntentEnvelope<K, P>;
      const decision = adjudicate(envelope, args.state, options.pack.policy);
      const seedEvents: AgentEvent[] = [
        { kind: "intent_proposed", envelope },
        { kind: "decision", decision, envelope },
      ];
      const seedDecision: SeedDecision<K, P> = {
        decision,
        envelope,
        toolUseId: pending.toolUseId,
        plan: options.pack.planner.plan(args.state, args.context),
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

// ── Internal types ──────────────────────────────────────────────────────────

interface SeedDecision<K extends string, P> {
  readonly decision: Decision;
  readonly envelope: IntentEnvelope<K, P>;
  readonly toolUseId: string;
  readonly plan: import("@adjudicate/core/llm").Plan;
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
