/**
 * Planner conformance — runtime guard against the strongest claim of the
 * framework: "the LLM cannot see mutations" plus T4's tighter sibling:
 * "the LLM cannot propose intents the Pack does not declare."
 *
 * The CapabilityPlanner is named security-sensitive. Two failure modes:
 *
 *   1. **Mutating tool leak** (pre-T4): a misconfigured plan exposes a
 *      tool from `MUTATING` in `visibleReadTools`. `assertPlanReadOnly`
 *      throws.
 *   2. **Allowed-intent leak** (T4 #1): a plan advertises an intent kind
 *      not present in the Pack's `intents` declaration. The LLM
 *      effectively learns of a new mutation the Pack never claimed to
 *      support — guards probably do not cover it, and `policy.default`
 *      decides the outcome. `assertPlanSubsetOfPack` throws.
 *
 * `safePlan(planner, classification, pack?)` runs both assertions on
 * every `plan()` call when `pack` is supplied. Adopters wrap once at
 * Pack construction; misconfigurations fail-loud at runtime, before the
 * LLM sees the leaked surface.
 */

import type { PackV0 } from "../pack.js";
import type { CapabilityPlanner, Plan } from "./planner.js";
import { isMutating, type ToolClassification } from "./tool-classifier.js";

export class PlanConformanceError extends Error {
  constructor(
    public readonly mutatingToolsLeaked: ReadonlyArray<string>,
    public readonly intentsLeaked: ReadonlyArray<string> = [],
  ) {
    const parts: string[] = [];
    if (mutatingToolsLeaked.length > 0) {
      parts.push(
        `Plan.visibleReadTools contains MUTATING tools: ${mutatingToolsLeaked.join(", ")}`,
      );
    }
    if (intentsLeaked.length > 0) {
      parts.push(
        `Plan.allowedIntents contains intents absent from Pack.intents: ${intentsLeaked.join(", ")}`,
      );
    }
    super(parts.join("; "));
    this.name = "PlanConformanceError";
  }
}

/**
 * Assert that no MUTATING tool name appears in `plan.visibleReadTools`.
 * Throws `PlanConformanceError` listing the offenders, otherwise returns
 * normally.
 *
 * Pure function — safe to call anywhere on the hot path.
 */
export function assertPlanReadOnly(
  plan: Plan,
  classification: ToolClassification,
): void {
  const leaked: string[] = [];
  for (const name of plan.visibleReadTools) {
    if (isMutating(classification, name)) {
      leaked.push(name);
    }
  }
  if (leaked.length > 0) {
    throw new PlanConformanceError(leaked);
  }
}

/**
 * T4 (#1, top-priority F): assert that every intent in `plan.allowedIntents`
 * is declared in `pack.intents`. Catches a planner that advertises a
 * mutation the Pack never claimed to handle — typically a refactoring
 * regression (intent renamed in the Pack's policy but the planner kept
 * the old name).
 *
 * Pure function — throws `PlanConformanceError` on first violation set.
 */
export function assertPlanSubsetOfPack<K extends string>(
  plan: Plan,
  pack: PackV0<K, unknown, unknown, unknown>,
): void {
  const declared = new Set<string>(pack.intents);
  const leaked: string[] = [];
  for (const k of plan.allowedIntents) {
    if (!declared.has(k)) {
      leaked.push(k);
    }
  }
  if (leaked.length > 0) {
    throw new PlanConformanceError([], leaked);
  }
}

/**
 * Wrap a CapabilityPlanner so its output is checked against the
 * ToolClassification — and (T4) optionally against the Pack's `intents`
 * declaration — on every `plan()` call. Misconfigurations throw
 * `PlanConformanceError` synchronously — the LLM never sees a leaked
 * MUTATING tool or an intent absent from the Pack.
 *
 * Adopters typically wire this once at Pack construction:
 *
 *   const planner = safePlan(rawPlanner, MY_TOOL_CLASSIFICATION, myPack);
 *
 * The original `staticPlanner` and bare planner authoring stay untouched
 * for tests that intentionally drive misconfigurations.
 */
export function safePlan<S, C = unknown>(
  planner: CapabilityPlanner<S, C>,
  classification: ToolClassification,
  pack?: PackV0<string, unknown, unknown, unknown>,
): CapabilityPlanner<S, C> {
  return {
    plan(state: S, context: C): Plan {
      const plan = planner.plan(state, context);
      assertPlanReadOnly(plan, classification);
      if (pack !== undefined) {
        assertPlanSubsetOfPack(plan, pack);
      }
      return plan;
    },
  };
}
