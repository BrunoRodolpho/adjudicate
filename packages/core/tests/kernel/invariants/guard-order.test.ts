/**
 * Invariant: kernel guard evaluation order is `state → taint → auth → business`.
 *
 * This is the soundness property the codebase has named load-bearing in three
 * places (PolicyBundle JSDoc, Pack JSDoc, ADR-104, docs/concepts.md §9). The
 * T8 reorder placed taint *before* auth so UNTRUSTED inputs short-circuit
 * before any auth-guard side effect (audit-of-attempted-auth, rate-limiter
 * decrement, identity-service query) fires.
 *
 * Pre-T8 the doc said `state → auth → taint → business` and matched the code.
 * Post-T8 the code changed and the docs drifted. This test pins the order to
 * the code-enforced reality so future doc drift produces a failing test
 * rather than a silent inconsistency.
 *
 * Two invariants:
 *  1. Pure ordering — when every guard returns null, the trace records
 *     phases in the canonical sequence `kill, schema, state, taint, auth,
 *     business, default`.
 *  2. T8 short-circuit — an UNTRUSTED envelope on a TRUSTED-required intent
 *     kind short-circuits at the taint phase BEFORE any auth guard runs
 *     (the auth guard MUST NOT have been called).
 */

import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicateWithTrace } from "../../../src/kernel/adjudicate.js";
import type { Guard, PolicyBundle } from "../../../src/kernel/policy.js";

const permissivePolicy: TaintPolicy = {
  minimumFor: () => "UNTRUSTED",
};

const trustedRequiredPolicy: TaintPolicy = {
  minimumFor: () => "TRUSTED",
};

function envelopeWith(
  kind: string,
  taint: Taint,
): IntentEnvelope<string, { x: number }> {
  return buildEnvelope<string, { x: number }>({
    kind,
    payload: { x: 1 },
    actor: { principal: "llm", sessionId: "s-test" },
    taint,
    nonce: "n-guard-order-test",
    createdAt: "2026-05-13T12:00:00.000Z",
  });
}

describe("invariant: kernel guard evaluation order is state → taint → auth → business", () => {
  it("trace records phases in canonical sequence when every guard passes", () => {
    const passThrough: Guard<string, unknown, unknown> = () => null;

    const bundle: PolicyBundle<string, unknown, unknown> = {
      stateGuards: [passThrough],
      authGuards: [passThrough],
      taint: permissivePolicy,
      business: [passThrough],
      default: "EXECUTE",
    };

    const { trace } = adjudicateWithTrace(
      envelopeWith("test.intent", "UNTRUSTED"),
      {},
      bundle,
    );

    const phases = trace.map((entry) => entry.phase);
    expect(phases).toEqual([
      "kill",
      "schema",
      "state",
      "taint",
      "auth",
      "business",
      "default",
    ]);
  });

  it("UNTRUSTED on TRUSTED-required kind short-circuits at taint BEFORE auth runs (T8 reorder)", () => {
    let authGuardCalled = false;
    let stateGuardCalled = false;

    const stateGuardSpy: Guard<string, unknown, unknown> = () => {
      stateGuardCalled = true;
      return null;
    };
    const authGuardSpy: Guard<string, unknown, unknown> = () => {
      authGuardCalled = true;
      return null;
    };

    const bundle: PolicyBundle<string, unknown, unknown> = {
      stateGuards: [stateGuardSpy],
      authGuards: [authGuardSpy],
      taint: trustedRequiredPolicy,
      business: [],
      default: "EXECUTE",
    };

    const { decision, trace } = adjudicateWithTrace(
      envelopeWith("trusted.kind", "UNTRUSTED"),
      {},
      bundle,
    );

    expect(stateGuardCalled).toBe(true);
    expect(authGuardCalled).toBe(false);
    expect(decision.kind).toBe("REFUSE");

    const taintEntry = trace.find((e) => e.phase === "taint");
    expect(taintEntry?.outcome).toBe("match");

    const authEntry = trace.find((e) => e.phase === "auth");
    expect(authEntry).toBeUndefined();
  });

  it("auth runs after taint when taint passes (auth seen before business in trace)", () => {
    const passThrough: Guard<string, unknown, unknown> = () => null;

    const bundle: PolicyBundle<string, unknown, unknown> = {
      stateGuards: [],
      authGuards: [passThrough],
      taint: permissivePolicy,
      business: [passThrough],
      default: "EXECUTE",
    };

    const { trace } = adjudicateWithTrace(
      envelopeWith("test.intent", "UNTRUSTED"),
      {},
      bundle,
    );

    const taintIdx = trace.findIndex((e) => e.phase === "taint");
    const authIdx = trace.findIndex((e) => e.phase === "auth");
    const businessIdx = trace.findIndex((e) => e.phase === "business");

    expect(taintIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeGreaterThan(taintIdx);
    expect(businessIdx).toBeGreaterThan(authIdx);
  });
});
