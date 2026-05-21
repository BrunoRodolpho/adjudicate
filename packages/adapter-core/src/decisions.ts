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
 * **First non-continue Decision wins**: if multiple tool_use blocks fire
 * in the same assistant turn, the loop processes them in order but
 * stops translating the moment a non-continue Decision arrives. The
 * remaining blocks are surfaced as `not_processed_due_to_pause`.
 */

import type { Decision, IntentEnvelope } from "@adjudicate/core";
import { parkDeferredIntent } from "@adjudicate/runtime";
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
          version: ctx.envelope.version,
          nonce: ctx.envelope.nonce,
          taint: ctx.envelope.taint,
          actorPrincipal: ctx.envelope.actor.principal,
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
 */
async function runExecute<K extends string, P, S, H>(
  ctx: DecisionTranslationContext<K, P, S, H>,
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

export { AdapterError, AdapterErrorCode };
