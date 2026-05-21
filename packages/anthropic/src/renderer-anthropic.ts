/**
 * First `PromptRenderer` implementation in the repo.
 *
 * Anthropic-specific (lives outside `@adjudicate/core`) because:
 * 1. The system-prompt copy is provider-tuned ("MUST NOT" reads
 *    differently to Claude vs OpenAI).
 * 2. Field shapes differ at the SDK boundary (Anthropic's `tools` vs
 *    OpenAI's `tools[].function`).
 *
 * For v0.1 the renderer accepts hand-supplied `toolSchemas`. Once L2
 * (risk primitives + intent-schema slot in PackV0) lands, the renderer
 * will derive schemas from `pack.intentSchemas` and `toolSchemas`
 * becomes an override. See package README "L2 rework callouts."
 */

import type {
  Plan,
  PromptRenderer,
  RenderedPrompt,
  SupervisorModifiers,
  ToolSchema,
} from "@adjudicate/core/llm";
import { intentKindToApiName } from "@adjudicate/adapter-core";

export interface AnthropicPromptRendererOptions {
  /** Identifies the Pack the agent serves; included in the system prompt for traceability. */
  readonly packId: string;
  /**
   * Tool schemas the renderer may surface. The renderer filters this list
   * to those advertised by the planner (`Plan.visibleReadTools` ∪
   * `Plan.allowedIntents`); schemas absent from the Plan are dropped.
   */
  readonly toolSchemas: ReadonlyArray<ToolSchema>;
  /** Optional adopter prologue prepended to the system prompt. */
  readonly basePrompt?: string;
  /** Max output tokens passthrough. Default 1024. */
  readonly maxTokens?: number;
}

/**
 * The default safety preamble. Exported so adopters can append (rather
 * than replace) when they supply a custom `basePrompt`.
 */
export const DEFAULT_ADJUDICATED_SYSTEM_PROMPT = [
  "You are an assistant that proposes structured actions on behalf of the user.",
  "",
  "Rules:",
  "1. You may ONLY call tools that appear in the tools list. Do NOT invent tool names; do NOT propose actions outside the listed tools.",
  "2. Some tools are read-only (queries) and some propose state-mutating intents (dotted names like `domain.action`). You do not execute mutations directly — they are policy-checked before they run.",
  "3. If a tool returns `is_error: true`, treat it as a recoverable failure: read the error text, decide whether to retry with different inputs, surface a question to the user, or stop.",
  "4. If the user requests something that requires a tool not in the current list, explain that the action isn't available right now and what would unblock it.",
].join("\n");

export function createAnthropicPromptRenderer<S, C = unknown>(
  options: AnthropicPromptRendererOptions,
): PromptRenderer<S, C> {
  const baseMaxTokens = options.maxTokens ?? 1024;
  const allSchemas = options.toolSchemas;

  return {
    render(
      _state: S,
      _context: C,
      plan: Plan,
      modifiers?: SupervisorModifiers,
    ): RenderedPrompt {
      const visibleNames = new Set<string>([
        ...plan.visibleReadTools,
        ...plan.allowedIntents,
      ]);
      // Filter to schemas the planner advertised, then translate dotted
      // intent-kind names (e.g. `pix.charge.create`) to Anthropic-API
      // form (`pix_charge_create`) so the API accepts them — Anthropic's
      // tool-name pattern is `^[a-zA-Z0-9_-]{1,128}$` and rejects dots.
      // The bridge's `classifyIncomingToolUse` reverses the translation
      // when the model echoes the name back on `tool_use`. See
      // `bridge.ts:intentKindToApiName` for the canonical translation.
      const toolSchemas = allSchemas
        .filter((s) => visibleNames.has(s.name))
        .map((s) =>
          s.name === intentKindToApiName(s.name)
            ? s
            : { ...s, name: intentKindToApiName(s.name) },
        );

      const segments: string[] = [];
      if (options.basePrompt) segments.push(options.basePrompt);
      segments.push(DEFAULT_ADJUDICATED_SYSTEM_PROMPT);
      segments.push(`Pack: ${options.packId}`);

      if (modifiers?.tone || modifiers?.mode) {
        const flavor: string[] = [];
        if (modifiers.mode) flavor.push(`mode=${modifiers.mode}`);
        if (modifiers.tone) flavor.push(`tone=${modifiers.tone}`);
        segments.push("");
        segments.push(`Supervisor modifiers: ${flavor.join(", ")}`);
      }

      return {
        systemPrompt: segments.join("\n"),
        toolSchemas,
        maxTokens: baseMaxTokens,
      };
    },
  };
}
