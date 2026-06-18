/**
 * Bridge module — the boundary between provider tool-use blocks and
 * adjudicate's `IntentEnvelope`s.
 *
 * Convention: intent-kind tool name (e.g. `pix.charge.create`) is
 * translated to a wire-friendly form by replacing `.` with `_` (most
 * provider APIs forbid dots in tool names). The renderer applies the
 * translation outbound; `classifyIncomingToolUse` accepts either the
 * translated form (live API path) or the raw dotted form (mocked-test
 * path) so test harnesses that bypass the renderer continue to work.
 *
 * Taint is ALWAYS `"UNTRUSTED"` for envelopes derived from LLM tool_use
 * blocks. There is no path from this module that raises taint upward;
 * TRUSTED intents (e.g. webhook confirmations) come from elsewhere.
 */

import {
  buildEnvelope,
  type IntentEnvelope,
  type Origin,
  type Taint,
} from "@adjudicate/core";
import type { Plan } from "@adjudicate/core/llm";
import type { ToolClassification } from "./types.js";

/**
 * Translate an intent-kind / READ-tool name to its wire-API form.
 * Replaces `.` with `_` so names like `pix.charge.create` become
 * `pix_charge_create`, matching the lowest-common-denominator tool-name
 * pattern (`^[a-zA-Z0-9_-]+$`) that both Anthropic and OpenAI accept.
 * No-op for names that already contain only API-allowed characters.
 *
 * Reversibility caveat: an intent kind `a.b` and a READ tool `a_b` both
 * translate to `a_b` and become indistinguishable on the wire. Adopters
 * who hit this collision should rename one of them; the Pack-conformance
 * check (P2) surfaces the collision at install time.
 */
export function intentKindToApiName(name: string): string {
  return name.replaceAll(".", "_");
}

/**
 * 012 — the bridge classification union IS the typed `ToolClassification`
 * discriminant from the adapter-facing contracts. Aliasing them keeps a single
 * source of truth: the structural claim the executor surface is documented
 * against (`types.ts`) and the value `classifyIncomingToolUse` produces are the
 * same type, so the loop checks the discriminant rather than re-deriving
 * read-only-ness from a wire name downstream.
 */
export type ToolUseClassification = ToolClassification;

/**
 * Decide whether an incoming `tool_use` is a READ tool execution, an
 * intent proposal, or a hallucinated tool the planner did not advertise.
 *
 * Out-of-plan tool_uses translate to `isError: true` tool-results so the
 * loop never silently fails — the model gets a recoverable signal.
 *
 * The match is forgiving: the planner exposes the raw (dotted) intent
 * kind, the renderer ships the translated (underscored) form to the
 * provider API, and the model echoes back the translated form on
 * `tool_use`. We compare both raw and translated against each candidate
 * so mocked-test paths (which skip the renderer translation) and
 * live-API paths (which round-trip through translation) both work.
 *
 * 012 — wire-name collision (`'a.b'` intent vs `'a_b'` read tool both map to
 * `'a_b'`): the typed discriminant is the classification authority, so a
 * collision is NOT resolved by silently preferring whichever set we happened
 * to scan first. When the SAME incoming name matches BOTH a visible read tool
 * and an allowed intent, the classification is ambiguous and the tool use is
 * rejected as `out_of_plan` — fail-closed, never letting an attacker pick the
 * arm by exploiting scan order. Adopters who hit this rename one of the two
 * (the Pack-conformance disjointness check surfaces it at install time).
 */
export function classifyIncomingToolUse(
  toolUse: { readonly name: string; readonly input: unknown },
  plan: Plan,
): ToolUseClassification {
  const matchesName = (candidate: string): boolean =>
    candidate === toolUse.name ||
    intentKindToApiName(candidate) === toolUse.name;

  const readMatch = plan.visibleReadTools.find(matchesName);
  const intentMatch = plan.allowedIntents.find(matchesName);

  // Fail-closed on the documented wire-name collision: an incoming name that
  // resolves to BOTH a read tool and an intent is ambiguous; do not let scan
  // order decide which kernel arm runs. Refuse it as out_of_plan.
  if (readMatch !== undefined && intentMatch !== undefined) {
    return { kind: "out_of_plan", name: toolUse.name };
  }
  if (readMatch !== undefined) {
    return { kind: "read", name: readMatch, input: toolUse.input };
  }
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
   * Taint of the proposing context. The loop pins this to `"UNTRUSTED"`
   * for LLM-derived envelopes; this argument exists for symmetry with
   * `buildEnvelope` and to keep the boundary explicit.
   */
  readonly taint: Taint;
  /**
   * 041 — harness-stamped provenance SOURCE axis. The loop stamps a concrete
   * literal next to `taint:"UNTRUSTED"` at the single LLM-bytes site. Carried
   * here so the source is explicit at the harness boundary; bound into the
   * `intentHash` by `buildEnvelope`, but consulted by no kernel guard in 041.
   */
  readonly origin: Origin;
  readonly nonce: string;
}

/**
 * Construct an IntentEnvelope from a provider-neutral tool_use. Wraps
 * `buildEnvelope` from @adjudicate/core with adapter-specific defaults:
 * principal = `"llm"`, taint as supplied (always `"UNTRUSTED"` from the
 * loop), and `origin` as supplied (the loop stamps `"LLM"` — the model
 * proposed the bytes). `origin` joins the `intentHash` pre-image.
 */
export function buildEnvelopeFromToolUse(
  args: BuildEnvelopeFromToolUseArgs,
): IntentEnvelope<string, unknown> {
  return buildEnvelope({
    kind: args.intentKind,
    payload: args.payload,
    actor: { principal: "llm", sessionId: args.sessionId },
    taint: args.taint,
    origin: args.origin,
    nonce: args.nonce,
  });
}
