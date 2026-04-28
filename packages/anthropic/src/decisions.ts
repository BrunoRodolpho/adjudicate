/**
 * Decision → Anthropic tool_result + loop-action translator.
 *
 * One branch per `Decision.kind`. Returns:
 * - `toolResult` — the `ToolResultBlockParam` that goes back to Anthropic
 *   in the next user-role message (or `null` if no tool_result is sent).
 * - `loopAction` — what the adapter's send loop should do next:
 *   `continue` (next iteration), `pause_for_user_confirmation` /
 *   `pause_for_defer` (return outcome to adopter), or
 *   `complete_for_escalation` (terminate the turn).
 * - `events` — `AgentEvent`s to push for audit / transcript display.
 *
 * **REWRITE** runs the executor against the *rewritten* envelope (NOT
 * the original) and surfaces a human-readable note in the tool_result by
 * default.
 *
 * **First non-continue Decision wins**: if multiple tool_use blocks
 * fire in the same assistant turn, the loop processes them in order
 * but stops translating the moment a non-continue Decision arrives.
 * The remaining blocks are surfaced as `not_processed_due_to_pause`.
 */

import type { ToolResultBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Decision, IntentEnvelope } from "@adjudicate/core";
import { parkDeferredIntent } from "@adjudicate/runtime";
import {
  AnthropicAdapterError,
  AnthropicAdapterErrorCode,
} from "./errors.js";
import type {
  ConfirmationStore,
  DeferRedis,
  ParkRedis,
} from "./persistence.js";
import type {
  AdopterExecutor,
  AgentEvent,
  AgentLogger,
} from "./types.js";

export interface DecisionTranslationContext<K extends string, P, S> {
  readonly decision: Decision;
  readonly envelope: IntentEnvelope<K, P>;
  readonly toolUseId: string;
  readonly sessionId: string;
  readonly state: S;
  readonly executor: AdopterExecutor<K, P, S>;
  readonly deferStore: DeferRedis & ParkRedis;
  readonly confirmationStore: ConfirmationStore;
  readonly historySnapshot: ReadonlyArray<MessageParam>;
  readonly rk: (raw: string) => string;
  readonly log?: AgentLogger;
  /**
   * Per-turn token generator. Adapter passes `crypto.randomUUID()` by
   * default; tests can inject a deterministic generator.
   */
  readonly generateToken: () => string;
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
  readonly toolResult: ToolResultBlockParam | null;
  readonly loopAction: LoopAction;
  readonly extraEvents: ReadonlyArray<AgentEvent>;
}

/**
 * Translate a `Decision` into an Anthropic `tool_result` plus the next
 * loop action. The caller (the send loop) appends the tool_result to
 * the next user-role message and either continues or pauses based on
 * `loopAction.kind`.
 */
export async function translateDecision<K extends string, P, S>(
  ctx: DecisionTranslationContext<K, P, S>,
): Promise<DecisionTranslation> {
  switch (ctx.decision.kind) {
    case "EXECUTE":
      return runExecute(ctx, ctx.envelope, /* rewriteNote */ null);
    case "REWRITE":
      return runExecute(
        ctx,
        ctx.decision.rewritten as IntentEnvelope<K, P>,
        ctx.decision.reason,
      );
    case "REFUSE": {
      const text = ctx.decision.refusal.userFacing;
      const result: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: ctx.toolUseId,
        content: text,
        is_error: true,
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
        // 24h default; adopter persistence may expire sooner.
        24 * 60 * 60,
      );
      const result: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: ctx.toolUseId,
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
      const result: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: ctx.toolUseId,
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
      const ttlSeconds =
        Math.max(ctx.decision.timeoutMs, 1000) / 1000 + 60;
      const parkResult = await parkDeferredIntent({
        envelope: {
          intentHash: ctx.envelope.intentHash,
          kind: ctx.envelope.kind,
          actor: { sessionId: ctx.envelope.actor.sessionId },
          payload: ctx.envelope.payload,
        },
        signal: ctx.decision.signal,
        ttlSeconds,
        redis: ctx.deferStore,
        rk: ctx.rk,
        log: ctx.log,
      });
      if (!parkResult.parked) {
        const result: ToolResultBlockParam = {
          type: "tool_result",
          tool_use_id: ctx.toolUseId,
          content: `This action could not be queued (per-session quota exceeded; ${parkResult.observed}/${parkResult.limit}).`,
          is_error: true,
        };
        return {
          toolResult: result,
          loopAction: { kind: "continue" },
          extraEvents: [
            { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
          ],
        };
      }
      const result: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: ctx.toolUseId,
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
 */
async function runExecute<K extends string, P, S>(
  ctx: DecisionTranslationContext<K, P, S>,
  effectiveEnvelope: IntentEnvelope<K, P>,
  rewriteReason: string | null,
): Promise<DecisionTranslation> {
  let executorResult: unknown;
  try {
    executorResult = await ctx.executor.invokeIntent(
      effectiveEnvelope,
      ctx.state,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "executor threw a non-Error value";
    const errResult: ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: ctx.toolUseId,
      content: `Executor failed: ${message}`,
      is_error: true,
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

  const result: ToolResultBlockParam = {
    type: "tool_result",
    tool_use_id: ctx.toolUseId,
    content: JSON.stringify(body),
  };
  return {
    toolResult: result,
    loopAction: { kind: "continue" },
    extraEvents: [
      handlerEvent,
      { kind: "tool_result", toolUseId: ctx.toolUseId, payload: result },
    ],
  };
}

/**
 * Re-exported for tests + adopters who want to hand-construct an error
 * tool_result from outside the loop.
 */
export function makeOutOfPlanToolResult(
  toolUseId: string,
  toolName: string,
): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: `Tool "${toolName}" is not available in the current plan.`,
    is_error: true,
  };
}

/** Re-exported so the loop can throw with a typed code if needed. */
export { AnthropicAdapterError, AnthropicAdapterErrorCode };
