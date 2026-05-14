/**
 * Bridge module — the boundary between Anthropic `tool_use` blocks and
 * adjudicate's `IntentEnvelope`s.
 *
 * Convention: intent-kind tool name (e.g. `pix.charge.create`) is
 * translated to an Anthropic-API-compatible form by replacing `.` with
 * `_` (Anthropic's tool-name pattern is `^[a-zA-Z0-9_-]{1,128}$` —
 * dots are rejected). The renderer applies the translation outbound;
 * `classifyIncomingToolUse` accepts either the translated form (live
 * API path) or the raw dotted form (mocked-test path) so test
 * harnesses that bypass the renderer continue to work.
 *
 * Taint is ALWAYS `"UNTRUSTED"` for envelopes derived from LLM tool_use
 * blocks. There is no path from this module that raises taint upward;
 * TRUSTED intents (e.g. webhook confirmations) come from elsewhere.
 */

import { buildEnvelope, type IntentEnvelope, type Taint } from "@adjudicate/core";
import type { Plan } from "@adjudicate/core/llm";

/**
 * Translate an intent-kind / READ-tool name to its Anthropic-API form.
 * Replaces `.` with `_` so names like `pix.charge.create` become
 * `pix_charge_create`, which matches Anthropic's tool-name pattern
 * `^[a-zA-Z0-9_-]{1,128}$`. No-op for names that already contain only
 * API-allowed characters.
 *
 * Reversibility caveat: an intent kind `a.b` and a READ tool `a_b` both
 * translate to `a_b` and become indistinguishable on the wire. Adopters
 * who hit this collision should rename one of them; a future Pack-
 * conformance check (P2) will surface the collision at install time.
 */
export function intentKindToApiName(name: string): string {
  return name.replaceAll(".", "_");
}

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
 *
 * The match is forgiving: the planner exposes the raw (dotted) intent
 * kind, the renderer ships the translated (underscored) form to
 * Anthropic, and the model echoes back the translated form on
 * `tool_use`. We compare both raw and translated against each
 * candidate so mocked-test paths (which skip the renderer translation)
 * and live-API paths (which round-trip through translation) both work.
 */
export function classifyIncomingToolUse(
  toolUse: { readonly name: string; readonly input: unknown },
  plan: Plan,
): ToolUseClassification {
  const matchesName = (candidate: string): boolean =>
    candidate === toolUse.name ||
    intentKindToApiName(candidate) === toolUse.name;

  const readMatch = plan.visibleReadTools.find(matchesName);
  if (readMatch !== undefined) {
    // Surface the planner's original (dotted, if any) name so adopter
    // executors look it up by the same key the planner advertised.
    return { kind: "read", name: readMatch, input: toolUse.input };
  }
  const intentMatch = plan.allowedIntents.find(matchesName);
  if (intentMatch !== undefined) {
    return {
      kind: "intent",
      intentKind: intentMatch,
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
