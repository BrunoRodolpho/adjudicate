/**
 * {{className}} — CapabilityPlanner.
 *
 * Both deployment intents are TRUSTED-only (operator-initiated), so the
 * planner exposes read tools only. Mutating tools are MUTATING (filtered
 * out of `visibleReadTools`) and only invoked through operator console
 * code paths, never an LLM action.
 */

import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type Plan,
  type ToolClassification,
} from "@adjudicate/core/llm";
import type { {{className}}Context, {{className}}State } from "./types.js";

export const {{className}}Tools: ToolClassification = {
  READ_ONLY: new Set(["get_deployment_state", "list_recent_deploys"]),
  MUTATING: new Set(["request_deploy", "rollback_deploy"]),
};

const rawPlanner: CapabilityPlanner<{{className}}State, {{className}}Context> = {
  plan(_state): Plan {
    const allTools: string[] = [
      "get_deployment_state",
      "list_recent_deploys",
      "request_deploy",
      "rollback_deploy",
    ];
    return {
      visibleReadTools: filterReadOnly({{className}}Tools, allTools),
      // The LLM may NOT directly propose deploys or rollbacks — those
      // intents are TRUSTED-only. The LLM informs; operators decide.
      allowedIntents: [],
      forbiddenConcepts: [],
    };
  },
};

export const {{className}}CapabilityPlanner: CapabilityPlanner<
  {{className}}State,
  {{className}}Context
> = safePlan(rawPlanner, {{className}}Tools);
