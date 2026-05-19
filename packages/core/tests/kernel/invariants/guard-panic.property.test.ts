/**
 * Invariant: a throwing guard never panics out of `adjudicate()`.
 *
 * Per ADR-106 — the kernel wraps every guard invocation in try/catch and
 * converts a thrown error into a SECURITY REFUSE with the `kernel.GUARD_PANIC`
 * basis. The error never propagates to the adopter.
 *
 * This file tests that property exhaustively across:
 *   - all four guard phases (state, taint, auth, business)
 *   - throws at different positions in each phase's guard array
 *   - synchronous throws of Error and non-Error values
 *   - identical inputs producing byte-identical REFUSE basis (determinism)
 */
import { describe, expect, it } from "vitest";
import { adjudicate, adjudicateWithTrace } from "../../../src/kernel/adjudicate.js";
import { buildEnvelope } from "../../../src/envelope.js";
import type { Guard, PolicyBundle } from "../../../src/kernel/policy.js";
import type { TaintPolicy } from "../../../src/taint.js";

type TestKind = "k1";
type TestPayload = { value: number };
type TestState = { foo: string };

const baseEnvelope = buildEnvelope<TestKind, TestPayload>({
  kind: "k1",
  payload: { value: 42 },
  actor: { principal: "llm", sessionId: "s1" },
  taint: "TRUSTED",
  nonce: "fixed-nonce-for-determinism",
});

const baseState: TestState = { foo: "bar" };

const permissiveTaint: TaintPolicy = {
  minimumFor: () => "UNTRUSTED",
};

function makeBundle(
  overrides: Partial<PolicyBundle<TestKind, TestPayload, TestState>> = {},
): PolicyBundle<TestKind, TestPayload, TestState> {
  return {
    stateGuards: [],
    authGuards: [],
    business: [],
    taint: permissiveTaint,
    default: "REFUSE",
    ...overrides,
  };
}

function throwingGuard(message: string): Guard<TestKind, TestPayload, TestState> {
  return () => {
    throw new Error(message);
  };
}

const passingGuard: Guard<TestKind, TestPayload, TestState> = () => null;

describe("invariant: throwing guards never panic out of adjudicate()", () => {
  it("state guard throwing → SECURITY REFUSE with kernel.GUARD_PANIC basis", () => {
    const bundle = makeBundle({
      stateGuards: [throwingGuard("boom-state")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("guard_panic");
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic).toBeDefined();
    expect(panic?.detail?.phase).toBe("state");
    expect(panic?.detail?.message).toBe("boom-state");
  });

  it("auth guard throwing → SECURITY REFUSE with phase=auth", () => {
    const bundle = makeBundle({
      stateGuards: [passingGuard],
      authGuards: [throwingGuard("boom-auth")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("auth");
  });

  it("business guard throwing → SECURITY REFUSE with phase=business", () => {
    const bundle = makeBundle({
      business: [throwingGuard("boom-business")],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("business");
  });

  it("taint policy throwing → SECURITY REFUSE with phase=taint", () => {
    const bundle = makeBundle({
      taint: {
        minimumFor: () => {
          throw new Error("taint-policy-broke");
        },
      },
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("taint");
    expect(panic?.detail?.message).toBe("taint-policy-broke");
  });

  it("non-Error thrown value still produces structured REFUSE", () => {
    const bundle = makeBundle({
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      business: [
        () => {
          throw "string-thrown" as unknown as Error;
        },
      ],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("guard_panic");
  });

  it("throw at index N: only earlier guards' passes are accumulated", () => {
    const bundle = makeBundle({
      business: [passingGuard, passingGuard, throwingGuard("boom-at-2"), passingGuard],
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    const panic = decision.basis.find(
      (b) => b.category === "kernel" && b.code === "guard_panic",
    );
    expect(panic?.detail?.phase).toBe("business");
    expect(panic?.detail?.index).toBe(2);
  });

  it("determinism: same throwing input → byte-identical refusal basis", () => {
    const bundle = makeBundle({
      business: [throwingGuard("deterministic-boom")],
    });
    const first = adjudicate(baseEnvelope, baseState, bundle);
    const second = adjudicate(baseEnvelope, baseState, bundle);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("adjudicateWithTrace: throwing guard appears as match in trace", () => {
    const bundle = makeBundle({
      business: [passingGuard, throwingGuard("traced-boom")],
    });
    const { decision, trace } = adjudicateWithTrace(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
    const lastEntry = trace[trace.length - 1];
    expect(lastEntry?.phase).toBe("business");
    expect(lastEntry?.outcome).toBe("match");
    expect(lastEntry?.index).toBe(1);
  });

  it("no LLM mutation authority: throwing guard never produces EXECUTE", () => {
    // Even with policy.default = "EXECUTE", a guard panic must NOT yield
    // EXECUTE. Fail-closed posture is mandatory.
    const bundle = makeBundle({
      business: [throwingGuard("fail-closed-test")],
      default: "EXECUTE", // would normally execute on no-match
    });
    const decision = adjudicate(baseEnvelope, baseState, bundle);
    expect(decision.kind).toBe("REFUSE");
  });
});
