/**
 * {{className}} — CapabilityPlanner.
 *
 * Per-state tool visibility. `payment.confirm` is never LLM-proposable
 * (system-only via TaintPolicy). The other intents are visible based
 * on whether confirmed (refundable) state exists.
 *
 *   - No confirmed payments          → only `create` is proposable.
 *   - At least one confirmed payment → `create` and `refund` are proposable.
 *
 * `safePlan` wraps the raw planner so any plan() that exposes a MUTATING
 * tool to the LLM throws PlanConformanceError loudly at the boundary.
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
  READ_ONLY: new Set(["list_payments", "get_payment"]),
  MUTATING: new Set(["create_payment", "refund_payment"]),
};

const rawPlanner: CapabilityPlanner<{{className}}State, {{className}}Context> = {
  plan(state): Plan {
    const hasConfirmedPayment = Array.from(state.payments.values()).some(
      (p) => p.status === "confirmed",
    );
    const allTools: string[] = ["list_payments", "get_payment", "create_payment"];
    const allowedIntents: string[] = ["{{intentPrefix}}.payment.create"];
    if (hasConfirmedPayment) {
      allTools.push("refund_payment");
      allowedIntents.push("{{intentPrefix}}.payment.refund");
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
