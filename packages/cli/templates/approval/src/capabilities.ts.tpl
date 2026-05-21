/**
 * {{className}} — CapabilityPlanner.
 *
 * Per-state tool visibility. `approve`/`deny` are TRUSTED-only via the
 * TaintPolicy and never appear in the LLM's allowed-intents list. The
 * planner exposes `request` plus the read tools the LLM uses to draft
 * one.
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
  READ_ONLY: new Set(["list_requests", "get_request"]),
  MUTATING: new Set(["create_approval_request"]),
};

const rawPlanner: CapabilityPlanner<{{className}}State, {{className}}Context> = {
  plan(state): Plan {
    const allTools: string[] = [
      "list_requests",
      "get_request",
      "create_approval_request",
    ];
    // No pending request → LLM may propose a new one.
    // Pending request → LLM may only inspect; humans approve/deny.
    const allowedIntents: string[] = state.request === null
      ? ["{{intentPrefix}}.approval.request"]
      : [];
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
