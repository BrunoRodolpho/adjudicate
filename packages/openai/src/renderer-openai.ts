/**
 * OpenAI prompt renderer.
 *
 * Mirrors `createAnthropicPromptRenderer` but tuned for OpenAI's API:
 *   - Same dotted → underscored tool-name translation. OpenAI's
 *     `function.name` pattern is `^[a-zA-Z0-9_-]+$` — dots are rejected.
 *   - System-prompt copy stays close to the Anthropic version. OpenAI's
 *     instruction-following responds the same way to "MUST NOT" /
 *     "Rules" language. Pack metadata (id) is included for traceability.
 *
 * The renderer consumes the Plan produced by the security-sensitive
 * CapabilityPlanner and never makes capability decisions of its own.
 */

import { intentKindToApiName } from "@adjudicate/adapter-core";
import type {
  Plan,
  PromptRenderer,
  RenderedPrompt,
  SupervisorModifiers,
  ToolSchema,
} from "@adjudicate/core/llm";

export interface OpenAIPromptRendererOptions {
  /** Pack id; included in the system prompt for traceability. */
  readonly packId: string;
  /**
   * Tool schemas the renderer may surface. The renderer filters this list
   * to those advertised by the planner; schemas absent from the Plan are
   * dropped.
   */
  readonly toolSchemas: ReadonlyArray<ToolSchema>;
  /** Optional adopter prologue prepended to the system prompt. */
  readonly basePrompt?: string;
  /** Max output tokens passthrough. Default 1024. */
  readonly maxTokens?: number;
}

export const DEFAULT_OPENAI_ADJUDICATED_SYSTEM_PROMPT = [
  "You are an assistant that proposes structured actions on behalf of the user.",
  "",
  "Rules:",
  "1. You may ONLY call tools that appear in the tools list. Do NOT invent tool names; do NOT propose actions outside the listed tools.",
  "2. Some tools are read-only (queries) and some propose state-mutating intents (dotted names like `domain.action`). You do not execute mutations directly — they are policy-checked before they run.",
  "3. If a tool returns an error, treat it as a recoverable failure: read the error text, decide whether to retry with different inputs, surface a question to the user, or stop.",
  "4. If the user requests something that requires a tool not in the current list, explain that the action isn't available right now and what would unblock it.",
].join("\n");

export function createOpenAIPromptRenderer<S, C = unknown>(
  options: OpenAIPromptRendererOptions,
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
      // intent-kind names to OpenAI-API form. OpenAI's
      // `function.name` pattern matches Anthropic's — dots rejected.
      const toolSchemas = allSchemas
        .filter((s) => visibleNames.has(s.name))
        .map((s) =>
          s.name === intentKindToApiName(s.name)
            ? s
            : { ...s, name: intentKindToApiName(s.name) },
        );

      const segments: string[] = [];
      if (options.basePrompt) segments.push(options.basePrompt);
      segments.push(DEFAULT_OPENAI_ADJUDICATED_SYSTEM_PROMPT);
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
