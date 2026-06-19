/**
 * T4 #1 / top-priority F — `assertPlanSubsetOfPack` and the optional
 * `pack` arg on `safePlan`. Defends against the failure where a planner
 * advertises an intent kind absent from the Pack's `intents` declaration
 * — guards probably do not cover it, and `policy.default` decides the
 * outcome.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  assertPlanSubsetOfPack,
  PlanConformanceError,
  safePlan,
  staticPlanner,
  type Plan,
  type ToolClassification,
  type CapabilityPlanner,
  type PackV0,
  type PolicyBundle,
  type TaintPolicy,
} from "../../src/index.js";

const taintPolicy: TaintPolicy = { minimumFor: () => "UNTRUSTED" };
const planner: CapabilityPlanner<unknown, unknown> = {
  plan(): Plan {
    return {
      visibleReadTools: [],
      allowedIntents: ["thing.do"],
    };
  },
};

const classification: ToolClassification = {
  READ_ONLY: new Set(),
  MUTATING: new Set(),
};

function makePack<K extends string>(intents: readonly K[]) {
  const policy: PolicyBundle<K, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business: [() => null],
    default: "REFUSE",
  };
  return {
    id: "pack-test",
    version: "0.1.0-experimental",
    contract: "v0",
    intents,
    policy,
    planner,
    basisCodes: ["x.invalid"],
  } as const satisfies PackV0<K, unknown, unknown, unknown>;
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    visibleReadTools: [],
    allowedIntents: [],
    ...overrides,
  };
}

describe("assertPlanSubsetOfPack", () => {
  it("passes when allowedIntents is a subset of pack.intents", () => {
    const pack = makePack(["thing.do", "thing.cancel"]);
    const plan = makePlan({ allowedIntents: ["thing.do"] });
    expect(() => assertPlanSubsetOfPack(plan, pack)).not.toThrow();
  });

  it("passes when allowedIntents equals pack.intents", () => {
    const pack = makePack(["thing.do", "thing.cancel"]);
    const plan = makePlan({ allowedIntents: ["thing.do", "thing.cancel"] });
    expect(() => assertPlanSubsetOfPack(plan, pack)).not.toThrow();
  });

  it("passes when allowedIntents is empty", () => {
    const pack = makePack(["thing.do"]);
    const plan = makePlan({ allowedIntents: [] });
    expect(() => assertPlanSubsetOfPack(plan, pack)).not.toThrow();
  });

  it("throws when allowedIntents has an intent absent from pack.intents", () => {
    const pack = makePack(["thing.do"]);
    const plan = makePlan({ allowedIntents: ["thing.do", "admin.delete_all"] });
    expect(() => assertPlanSubsetOfPack(plan, pack)).toThrow(
      PlanConformanceError,
    );
  });

  it("PlanConformanceError carries the leaked intents list", () => {
    const pack = makePack(["thing.do"]);
    const plan = makePlan({
      allowedIntents: ["admin.delete_all", "thing.do", "secret.leak"],
    });
    let caught: PlanConformanceError | undefined;
    try {
      assertPlanSubsetOfPack(plan, pack);
    } catch (err) {
      caught = err as PlanConformanceError;
    }
    expect(caught).toBeInstanceOf(PlanConformanceError);
    expect(caught!.intentsLeaked).toEqual(["admin.delete_all", "secret.leak"]);
    expect(caught!.mutatingToolsLeaked).toEqual([]);
  });
});

describe("safePlan with optional pack arg (T4)", () => {
  it("passes when planner advertises only declared intents", () => {
    const pack = makePack(["thing.do"]);
    const wrapped = safePlan(
      staticPlanner({
        visibleReadTools: [],
        allowedIntents: ["thing.do"],
        }),
      classification,
      pack,
    );
    expect(() => wrapped.plan({}, {})).not.toThrow();
  });

  it("throws when planner advertises an intent absent from the Pack", () => {
    const pack = makePack(["thing.do"]);
    const wrapped = safePlan(
      staticPlanner({
        visibleReadTools: [],
        allowedIntents: ["thing.do", "admin.delete_all"],
        }),
      classification,
      pack,
    );
    expect(() => wrapped.plan({}, {})).toThrow(PlanConformanceError);
  });

  it("without a pack arg, allowedIntents goes unchecked (back-compat)", () => {
    const wrapped = safePlan(
      staticPlanner({
        visibleReadTools: [],
        allowedIntents: ["any.intent.even.unknown"],
        }),
      classification,
    );
    expect(() => wrapped.plan({}, {})).not.toThrow();
  });
});

// 024 (T4) — the pack-bound 3-arg `safePlan` now accepts the minimal
// `PackIntentsSurface` (`{ intents }`) so a Pack can engage `assertPlanSubsetOfPack`
// on every plan() WITHOUT the planner↔pack construction cycle (the full PackV0
// references the planner). These pin that the minimal surface engages the check
// exactly like a full pack — the form the shipped packs adopt in `capabilities.ts`.
describe("safePlan with PackIntentsSurface (024 T4 — break the planner↔pack cycle)", () => {
  it("THROWS when allowedIntents ⊄ { intents } (subset invariant engaged via the minimal surface)", () => {
    const wrapped = safePlan(
      staticPlanner({
        visibleReadTools: [],
        allowedIntents: ["pix.charge.create", "admin.delete_all"],
      }),
      classification,
      // The minimal surface — exactly what a Pack passes from capabilities.ts.
      { intents: ["pix.charge.create", "pix.charge.refund"] },
    );
    let caught: PlanConformanceError | undefined;
    try {
      wrapped.plan({}, {});
    } catch (err) {
      caught = err as PlanConformanceError;
    }
    expect(caught).toBeInstanceOf(PlanConformanceError);
    expect(caught!.intentsLeaked).toEqual(["admin.delete_all"]);
  });

  it("PASSES when allowedIntents ⊆ { intents }", () => {
    const wrapped = safePlan(
      staticPlanner({
        visibleReadTools: [],
        allowedIntents: ["pix.charge.create"],
      }),
      classification,
      { intents: ["pix.charge.create", "pix.charge.refund"] },
    );
    expect(() => wrapped.plan({}, {})).not.toThrow();
  });

  it("assertPlanSubsetOfPack accepts the minimal { intents } surface directly", () => {
    const plan = makePlan({ allowedIntents: ["a", "z"] });
    // Non-vacuous: 'z' is absent from the surface → throws.
    expect(() => assertPlanSubsetOfPack(plan, { intents: ["a", "b"] })).toThrow(
      PlanConformanceError,
    );
    // And the in-set case passes.
    expect(() =>
      assertPlanSubsetOfPack(makePlan({ allowedIntents: ["a"] }), {
        intents: ["a", "b"],
      }),
    ).not.toThrow();
  });
});

describe("invariant: assertPlanSubsetOfPack throws iff allowedIntents ⊄ pack.intents", () => {
  it("holds across arbitrary plans and packs", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 6 }),
        (packIntents, planIntents) => {
          const uniquePackIntents = Array.from(new Set(packIntents));
          const pack = makePack(uniquePackIntents);
          const plan = makePlan({ allowedIntents: planIntents });
          const declared = new Set(uniquePackIntents);
          const expectedThrow = planIntents.some((k) => !declared.has(k));
          let actuallyThrew = false;
          try {
            assertPlanSubsetOfPack(plan, pack);
          } catch {
            actuallyThrew = true;
          }
          expect(actuallyThrew).toBe(expectedThrow);
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
