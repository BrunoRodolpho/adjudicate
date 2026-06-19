/**
 * @adjudicate/pack-payments-pix — CapabilityPlanner.
 *
 * Per-state tool visibility. The webhook intent (`pix.charge.confirm`) is
 * NEVER LLM-proposable — only the payment provider's authenticated webhook
 * produces it, with TRUSTED taint. The other two intents are visible based
 * on whether refundable state exists.
 *
 * **023 — bound payload at the executor seam.** A PIX intent this planner
 * exposes (`pix.charge.create` / `pix.charge.refund`) reaches the adopter's
 * executor ONLY through the adapter-core loop's binding gate (`runExecute` /
 * `verifyResourceBinding`): the executor honors ONLY the exact `payload` /
 * `resourceRefs` (e.g. the `account` the refund targets) the kernel adjudicated.
 * An LLM that swaps the target account between decision and execution
 * fail-closes upstream and never reaches the executor (anti-IDOR).
 *
 *   - No confirmed charges          → only `create` is proposable.
 *   - At least one confirmed charge → `create` and `refund` are proposable.
 *
 * Real adopters typically narrow further (e.g., "refund only the customer's
 * own confirmed charges"); the Pack ships the minimal-correct default.
 */

import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type Plan,
  type ToolClassification,
} from "@adjudicate/core/llm";
import type { PixContext, PixIntentKind, PixState } from "./types.js";

export const PIX_TOOLS: ToolClassification = {
  READ_ONLY: new Set(["list_pix_charges", "get_pix_charge"]),
  MUTATING: new Set(["create_pix_charge", "refund_pix_charge"]),
};

/**
 * 024 (T4) — the Pack's declared intent kinds, named HERE (not only inline in
 * the `PackV0` value at `index.ts`) so the pack-bound `safePlan(planner,
 * classification, { intents })` form can engage `assertPlanSubsetOfPack` on every
 * `plan()` call WITHOUT a planner↔pack construction cycle (the full `paymentsPixPack`
 * references this planner). `index.ts` reuses this same tuple for its `intents`
 * field so the two can never drift. A planner advertising an `allowedIntents`
 * kind absent from this set now fails loud (`PlanConformanceError`) at every
 * plan(), not only at install.
 */
export const PIX_INTENTS = [
  "pix.charge.create",
  "pix.charge.confirm",
  "pix.charge.refund",
] as const satisfies readonly PixIntentKind[];

/**
 * 025 (capabilities-as-budgets) — the budget-CAPABLE intent kinds.
 *
 * A standing, human-granted, BOUNDED budget grant (capabilities-as-budgets) may
 * satisfy the "ask first" threshold for these kinds WITHOUT a per-intent
 * confirmation receipt — up to the grant's declared limit per window. The host
 * wires `AdjudicatedAgentOptions.budget.resolveGrant` to return a grant ONLY for
 * a kind in THIS set (an operator-authorized money-mover budget); the kernel
 * substitution still fires ONLY on a REQUEST_CONFIRMATION outcome and NEVER
 * weakens any state/taint/auth/business guard (§C / §D #2).
 *
 * These are the LLM-proposable money-movers (`pix.charge.create` /
 * `pix.charge.refund`). The provider-webhook intent `pix.charge.confirm` is
 * NEVER LLM-proposable (TRUSTED-only) and is therefore NOT budget-capable — a
 * budget relieves human-in-the-loop friction for bounded VOLUMES of the same
 * money-mover class, never the system-only confirm path.
 */
export const PIX_BUDGET_CAPABLE_INTENTS = [
  "pix.charge.create",
  "pix.charge.refund",
] as const satisfies readonly PixIntentKind[];

const rawPixCapabilityPlanner: CapabilityPlanner<PixState, PixContext> = {
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
    };
  },
};

/**
 * The Pack's exported planner is wrapped in `safePlan` — every plan()
 * invocation is asserted against `PIX_TOOLS` so a future regression that
 * exposes a MUTATING tool to the LLM throws PlanConformanceError loudly
 * before the LLM sees the leaked tool. This is the recommended pattern
 * for every Pack.
 *
 * 024 (T4) — now the pack-bound 3-arg form `safePlan(planner, classification,
 * pack)`: the `pack` ({ intents }) surface engages `assertPlanSubsetOfPack` on
 * every plan() so a planner that advertises an intent kind absent from
 * `PIX_INTENTS` also throws loud (the subset invariant the shipped 2-arg form
 * never engaged).
 */
const classification = PIX_TOOLS;
const pack = { intents: PIX_INTENTS };
export const pixCapabilityPlanner: CapabilityPlanner<PixState, PixContext> =
  safePlan(rawPixCapabilityPlanner, classification, pack);
