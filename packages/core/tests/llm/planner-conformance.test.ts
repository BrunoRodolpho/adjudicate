/**
 * Planner conformance — assertPlanReadOnly invariant + safePlan wrapper.
 *
 * Load-bearing: the framework's "the LLM cannot see mutations" claim
 * depends on this check holding at every plan() call.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  assertPlanReadOnly,
  PlanConformanceError,
  safePlan,
  staticPlanner,
  type Plan,
  type ToolClassification,
} from "../../src/llm/index.js";

const classification: ToolClassification = {
  READ_ONLY: new Set(["search_catalog", "view_cart", "view_order"]),
  MUTATING: new Set(["add_to_cart", "checkout", "cancel_order"]),
};

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    visibleReadTools: [],
    allowedIntents: [],
    forbiddenConcepts: [],
    ...overrides,
  };
}

describe("assertPlanReadOnly", () => {
  it("passes when visibleReadTools is empty", () => {
    expect(() => assertPlanReadOnly(makePlan(), classification)).not.toThrow();
  });

  it("passes when visibleReadTools contains only READ_ONLY tools", () => {
    const plan = makePlan({
      visibleReadTools: ["search_catalog", "view_cart"],
    });
    expect(() => assertPlanReadOnly(plan, classification)).not.toThrow();
  });

  it("throws when visibleReadTools contains a MUTATING tool", () => {
    const plan = makePlan({
      visibleReadTools: ["search_catalog", "add_to_cart"],
    });
    expect(() => assertPlanReadOnly(plan, classification)).toThrow(
      PlanConformanceError,
    );
  });

  it("PlanConformanceError lists every leaked MUTATING tool", () => {
    const plan = makePlan({
      visibleReadTools: ["add_to_cart", "search_catalog", "checkout"],
    });
    let caught: PlanConformanceError | undefined;
    try {
      assertPlanReadOnly(plan, classification);
    } catch (err) {
      caught = err as PlanConformanceError;
    }
    expect(caught).toBeInstanceOf(PlanConformanceError);
    expect(caught!.mutatingToolsLeaked).toEqual(["add_to_cart", "checkout"]);
  });

  it("ignores tools that aren't in either set (unclassified strings)", () => {
    const plan = makePlan({
      visibleReadTools: ["search_catalog", "totally_unknown_tool"],
    });
    // Unclassified tools do not flag as MUTATING — caller's classification
    // is the source of truth. This is the conservative, additive policy.
    expect(() => assertPlanReadOnly(plan, classification)).not.toThrow();
  });
});

describe("invariant: assertPlanReadOnly throws iff visibleReadTools ∩ MUTATING ≠ ∅", () => {
  it("holds across arbitrary plans and classifications", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 8 }),
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 8 }),
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 8 }),
        (readNames, mutNames, visibleNames) => {
          // Force disjoint READ vs MUTATING — the type contract requires it.
          const reads = new Set(readNames);
          const muts = new Set(mutNames.filter((n) => !reads.has(n)));
          const cls: ToolClassification = {
            READ_ONLY: reads,
            MUTATING: muts,
          };
          const plan = makePlan({ visibleReadTools: visibleNames });
          const expectedThrow = visibleNames.some((n) => muts.has(n));
          let actuallyThrew = false;
          try {
            assertPlanReadOnly(plan, cls);
          } catch {
            actuallyThrew = true;
          }
          expect(actuallyThrew).toBe(expectedThrow);
        },
      ),
      { numRuns: 10_000 },
    );
  });
});

describe("safePlan", () => {
  it("forwards plan() output unchanged when conformance holds", () => {
    const plan = makePlan({ visibleReadTools: ["search_catalog"] });
    const planner = safePlan(staticPlanner(plan), classification);
    expect(planner.plan({}, {})).toEqual(plan);
  });

  it("throws on plan() when the inner planner returns a leaked tool", () => {
    const plan = makePlan({ visibleReadTools: ["add_to_cart"] });
    const planner = safePlan(staticPlanner(plan), classification);
    expect(() => planner.plan({}, {})).toThrow(PlanConformanceError);
  });

  it("calls the inner planner exactly once per plan() invocation", () => {
    let calls = 0;
    const inner = {
      plan() {
        calls++;
        return makePlan({ visibleReadTools: ["search_catalog"] });
      },
    };
    const planner = safePlan(inner, classification);
    planner.plan({}, {});
    planner.plan({}, {});
    expect(calls).toBe(2);
  });
});
