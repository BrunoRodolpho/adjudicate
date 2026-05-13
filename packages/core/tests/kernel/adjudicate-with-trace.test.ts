import { describe, expect, it } from "vitest";
import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type IntentEnvelope,
  type TaintPolicy,
} from "@adjudicate/core";
import {
  adjudicate,
  adjudicateWithTrace,
} from "../../src/kernel/adjudicate.js";
import type { Guard, PolicyBundle } from "../../src/kernel/policy.js";

type Kind = "order.tool.propose";
interface Payload {
  readonly toolName: string;
}
type State = { readonly step: "pre_order" | "shipped" | "terminal" };

const taintPolicy: TaintPolicy = {
  minimumFor: (kind) => (kind === "payment.send" ? "SYSTEM" : "UNTRUSTED"),
};

function baseEnvelope(
  overrides?: Partial<IntentEnvelope<Kind, Payload>>,
): IntentEnvelope<Kind, Payload> {
  const env = buildEnvelope<Kind, Payload>({
    kind: "order.tool.propose",
    payload: { toolName: "add_item" },
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "n-test",
    createdAt: "2026-04-23T12:00:00.000Z",
  });
  return { ...env, ...overrides } as IntentEnvelope<Kind, Payload>;
}

function bundle(
  overrides?: Partial<PolicyBundle<Kind, Payload, State>>,
): PolicyBundle<Kind, Payload, State> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: taintPolicy,
    business: [],
    default: "EXECUTE",
    ...overrides,
  };
}

// ─── Per-phase match coverage ──────────────────────────────────────────────

describe("adjudicateWithTrace — phase-by-phase match coverage", () => {
  it("default EXECUTE: kill→schema→taint→auth→business all pass, default matches", () => {
    const { decision, trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle(),
    );
    expect(decision.kind).toBe("EXECUTE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "taint", outcome: "pass" },
      { phase: "default", outcome: "match" },
    ]);
  });

  it("default REFUSE: same shape, default still matches", () => {
    const { decision, trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({ default: "REFUSE" }),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace.at(-1)).toEqual({ phase: "default", outcome: "match" });
  });

  it("schema mismatch: only kill pass + schema match", () => {
    const env = { ...baseEnvelope(), version: 999 as 2 };
    const { decision, trace } = adjudicateWithTrace(
      env,
      { step: "pre_order" },
      bundle(),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "match" },
    ]);
  });

  it("state guard match: trace stops at state[i], no taint/auth/business entries", () => {
    const refuseState: Guard<Kind, Payload, State> = () =>
      decisionRefuse(refuse("STATE", "state_fail", "nope"), [
        basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL),
      ]);
    Object.defineProperty(refuseState, "name", { value: "refuseState" });

    const { decision, trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "terminal" },
      bundle({ stateGuards: [refuseState] }),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      {
        phase: "state",
        index: 0,
        guardName: "refuseState",
        outcome: "match",
      },
    ]);
  });

  it("taint match (T8): trace runs through state-pass then taint-match", () => {
    const passGuard: Guard<Kind, Payload, State> = () => null;
    Object.defineProperty(passGuard, "name", { value: "passGuard" });

    const env = baseEnvelope({ kind: "payment.send" as Kind });
    const { decision, trace } = adjudicateWithTrace(
      env,
      { step: "pre_order" },
      bundle({ stateGuards: [passGuard] }),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      {
        phase: "state",
        index: 0,
        guardName: "passGuard",
        outcome: "pass",
      },
      { phase: "taint", outcome: "match" },
    ]);
  });

  it("auth match: trace covers kill/schema/state/taint pass + auth[i] match", () => {
    const authFail: Guard<Kind, Payload, State> = () =>
      decisionRefuse(refuse("AUTH", "auth_fail", "nope"), [
        basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT),
      ]);
    Object.defineProperty(authFail, "name", { value: "authFail" });

    const { decision, trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({ authGuards: [authFail] }),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "taint", outcome: "pass" },
      {
        phase: "auth",
        index: 0,
        guardName: "authFail",
        outcome: "match",
      },
    ]);
  });

  it("business match: trace covers everything up to business[i] match", () => {
    const businessRefuse: Guard<Kind, Payload, State> = () =>
      decisionRefuse(refuse("BUSINESS_RULE", "cap", "capped"), [
        basis("business", BASIS_CODES.business.QUANTITY_CAPPED),
      ]);
    Object.defineProperty(businessRefuse, "name", {
      value: "businessRefuse",
    });

    const { decision, trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({ business: [businessRefuse] }),
    );
    expect(decision.kind).toBe("REFUSE");
    expect(trace).toEqual([
      { phase: "kill", outcome: "pass" },
      { phase: "schema", outcome: "pass" },
      { phase: "taint", outcome: "pass" },
      {
        phase: "business",
        index: 0,
        guardName: "businessRefuse",
        outcome: "match",
      },
    ]);
  });
});

// ─── Array-phase indexing + naming ─────────────────────────────────────────

describe("adjudicateWithTrace — guard indexing and naming", () => {
  it("array-phase entries carry 0-based index", () => {
    const passA: Guard<Kind, Payload, State> = () => null;
    const passB: Guard<Kind, Payload, State> = () => null;
    const matchC: Guard<Kind, Payload, State> = () =>
      decisionExecute([basis("business", BASIS_CODES.business.RULE_SATISFIED)]);
    Object.defineProperty(passA, "name", { value: "passA" });
    Object.defineProperty(passB, "name", { value: "passB" });
    Object.defineProperty(matchC, "name", { value: "matchC" });

    const { trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({
        default: "REFUSE",
        business: [passA, passB, matchC],
      }),
    );

    const businessEntries = trace.filter((e) => e.phase === "business");
    expect(businessEntries).toEqual([
      { phase: "business", index: 0, guardName: "passA", outcome: "pass" },
      { phase: "business", index: 1, guardName: "passB", outcome: "pass" },
      { phase: "business", index: 2, guardName: "matchC", outcome: "match" },
    ]);
  });

  it("anonymous guards (inline arrows) omit guardName", () => {
    const { trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle({
        default: "REFUSE",
        business: [
          (): null => null,
          (): ReturnType<Guard<Kind, Payload, State>> =>
            decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]),
        ],
      }),
    );

    const businessEntries = trace.filter((e) => e.phase === "business");
    expect(businessEntries).toHaveLength(2);
    for (const e of businessEntries) {
      expect(e.guardName).toBeUndefined();
      expect(typeof e.index).toBe("number");
    }
  });
});

// ─── Structural invariants ─────────────────────────────────────────────────

describe("adjudicateWithTrace — structural invariants", () => {
  const businessRefuse: Guard<Kind, Payload, State> = () =>
    decisionRefuse(refuse("BUSINESS_RULE", "cap", "capped"), [
      basis("business", BASIS_CODES.business.QUANTITY_CAPPED),
    ]);

  it("trace always ends with exactly one match entry", () => {
    const cases: Array<{
      env: IntentEnvelope<Kind, Payload>;
      state: State;
      bundle: PolicyBundle<Kind, Payload, State>;
    }> = [
      {
        env: baseEnvelope(),
        state: { step: "pre_order" },
        bundle: bundle(),
      },
      {
        env: baseEnvelope(),
        state: { step: "pre_order" },
        bundle: bundle({ business: [businessRefuse] }),
      },
      {
        env: baseEnvelope({ kind: "payment.send" as Kind }),
        state: { step: "pre_order" },
        bundle: bundle(),
      },
      {
        env: { ...baseEnvelope(), version: 999 as 2 },
        state: { step: "pre_order" },
        bundle: bundle(),
      },
    ];

    for (const c of cases) {
      const { trace } = adjudicateWithTrace(c.env, c.state, c.bundle);
      const matches = trace.filter((e) => e.outcome === "match");
      expect(matches).toHaveLength(1);
      expect(trace.at(-1)?.outcome).toBe("match");
    }
  });

  it("decision is byte-identical to adjudicate() output (no behavior drift)", () => {
    const env = baseEnvelope();
    const state: State = { step: "pre_order" };
    const policy = bundle({ business: [businessRefuse] });

    const plainDecision = adjudicate(env, state, policy);
    const { decision: tracedDecision } = adjudicateWithTrace(
      env,
      state,
      policy,
    );

    expect(tracedDecision).toEqual(plainDecision);
  });

  it("array-phase entries are absent when the array is empty", () => {
    const { trace } = adjudicateWithTrace(
      baseEnvelope(),
      { step: "pre_order" },
      bundle(),
    );
    expect(trace.filter((e) => e.phase === "state")).toHaveLength(0);
    expect(trace.filter((e) => e.phase === "auth")).toHaveLength(0);
    expect(trace.filter((e) => e.phase === "business")).toHaveLength(0);
  });
});
