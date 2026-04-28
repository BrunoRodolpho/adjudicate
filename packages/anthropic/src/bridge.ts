/**
 * Bridge module — the boundary between Anthropic `tool_use` blocks and
 * adjudicate's `IntentEnvelope`s.
 *
 * Convention: tool name = intent kind for proposable intents (e.g.
 * `pix.charge.create`). READ tool names use the planner's snake_case
 * convention. The dotted form for intent kinds guarantees no collision —
 * Anthropic accepts dotted tool names.
 *
 * Taint is ALWAYS `"UNTRUSTED"` for envelopes derived from LLM tool_use
 * blocks. There is no path from this module that raises taint upward;
 * TRUSTED intents (e.g. webhook confirmations) come from elsewhere.
 */

import { buildEnvelope, type IntentEnvelope, type Taint } from "@adjudicate/core";
import type { Plan } from "@adjudicate/core/llm";

export type ToolUseClassification =
  | { readonly kind: "read"; readonly name: string; readonly input: unknown }
  | {
      readonly kind: "intent";
      readonly intentKind: string;
      readonly payload: unknown;
    }
  | { readonly kind: "out_of_plan"; readonly name: string };

/**
 * Decide whether an incoming `tool_use` block is a READ tool execution,
 * an intent proposal, or a hallucinated tool the planner did not advertise.
 *
 * Out-of-plan tool_uses translate to `is_error: true` tool_results so the
 * loop never silently fails — the LLM gets a recoverable signal.
 */
export function classifyIncomingToolUse(
  toolUse: { readonly name: string; readonly input: unknown },
  plan: Plan,
): ToolUseClassification {
  if (plan.visibleReadTools.includes(toolUse.name)) {
    return { kind: "read", name: toolUse.name, input: toolUse.input };
  }
  if (plan.allowedIntents.includes(toolUse.name)) {
    return {
      kind: "intent",
      intentKind: toolUse.name,
      payload: toolUse.input,
    };
  }
  return { kind: "out_of_plan", name: toolUse.name };
}

export interface BuildEnvelopeFromToolUseArgs {
  readonly intentKind: string;
  readonly payload: unknown;
  readonly sessionId: string;
  /**
   * Taint of the proposing context. The adapter pins this to `"UNTRUSTED"`
   * for LLM-derived envelopes; this argument exists for symmetry with
   * `buildEnvelope` and to keep the boundary explicit.
   */
  readonly taint: Taint;
  readonly nonce: string;
}

/**
 * Construct an IntentEnvelope from an Anthropic tool_use block. Wraps
 * `buildEnvelope` from @adjudicate/core with adapter-specific defaults:
 * principal = `"llm"`, taint as supplied (always `"UNTRUSTED"` from the
 * adapter's send loop).
 */
export function buildEnvelopeFromToolUse(
  args: BuildEnvelopeFromToolUseArgs,
): IntentEnvelope<string, unknown> {
  return buildEnvelope({
    kind: args.intentKind,
    payload: args.payload,
    actor: { principal: "llm", sessionId: args.sessionId },
    taint: args.taint,
    nonce: args.nonce,
  });
}
