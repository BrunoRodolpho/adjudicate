/**
 * @adjudicate/pack-payments-pix — CapabilityPlanner.
 *
 * Per-state tool visibility. The webhook intent (`pix.charge.confirm`) is
 * NEVER LLM-proposable — only the payment provider's authenticated webhook
 * produces it, with TRUSTED taint. The other two intents are visible based
 * on whether refundable state exists.
 *
 *   - No confirmed charges          → only `create` is proposable.
 *   - At least one confirmed charge → `create` and `refund` are proposable.
 *
 * Real adopters typically narrow further (e.g., "refund only the customer's
 * own confirmed charges"); the Pack ships the minimal-correct default.
 */

import {
  filterReadOnly,
  type CapabilityPlanner,
  type Plan,
  type ToolClassification,
} from "@adjudicate/core/llm";
import type { PixContext, PixState } from "./types.js";

export const PIX_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_pix_charges", "get_pix_charge"]),
  MUTATING: new Set(["create_pix_charge", "refund_pix_charge"]),
};

export const pixCapabilityPlanner: CapabilityPlanner<PixState, PixContext> = {
  plan(state): Plan {
    const hasConfirmedCharge = Array.from(state.charges.values()).some(
      (c) => c.status === "confirmed",
    );
    const allTools: string[] = [
      "list_pix_charges",
      "get_pix_charge",
      "create_pix_charge",
    ];
    const allowedIntents: string[] = ["pix.charge.create"];
    if (hasConfirmedCharge) {
      allTools.push("refund_pix_charge");
      allowedIntents.push("pix.charge.refund");
    }
    return {
      visibleReadTools: filterReadOnly(PIX_TOOLS, allTools),
      allowedIntents,
      forbiddenConcepts: [],
    };
  },
};
