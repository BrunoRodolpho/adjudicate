/**
 * {{className}} — CapabilityPlanner.
 *
 * Per-state tool visibility. `vendor.callback` is system-only via the
 * TaintPolicy and never appears in the LLM's allowed-intents. The
 * other intents become proposable in lock-step with the session
 * status the policy enforces.
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
  READ_ONLY: new Set(["get_kyc_status"]),
  MUTATING: new Set(["start_kyc", "upload_kyc_document", "complete_kyc"]),
};

const rawPlanner: CapabilityPlanner<{{className}}State, {{className}}Context> = {
  plan(state): Plan {
    const allTools: string[] = ["get_kyc_status"];
    const allowedIntents: string[] = [];

    if (state.session === null) {
      allTools.push("start_kyc");
      allowedIntents.push("{{intentPrefix}}.kyc.start");
    } else if (state.session.status === "documents_pending") {
      allTools.push("upload_kyc_document");
      allowedIntents.push("{{intentPrefix}}.kyc.document.upload");
    } else if (state.session.status === "completed") {
      allTools.push("complete_kyc");
      allowedIntents.push("{{intentPrefix}}.kyc.complete");
    }

    return {
      visibleReadTools: filterReadOnly({{className}}Tools, allTools),
      allowedIntents,
      forbiddenConcepts: [],
    };
  },
};

export const {{className}}CapabilityPlanner: CapabilityPlanner<
  {{className}}State,
  {{className}}Context
> = safePlan(rawPlanner, {{className}}Tools);
