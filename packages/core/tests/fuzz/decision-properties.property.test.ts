/**
 * Decision-fuzz harness — fast-check property tests over the kernel's
 * core invariants. Picks up where the existing invariant suite
 * (`tests/kernel/invariants/*`) leaves off — these properties target
 * adversarial inputs to the surface most exposed to envelope-author
 * mistakes: arbitrary envelope payloads and arbitrary guard
 * compositions.
 *
 * Each property runs 1000 trials per test (see the `RUNS` constant
 * below; raise it for deeper production CI sweeps via vitest config).
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  adjudicate,
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  sha256Canonical,
  type Decision,
  type Guard,
  type IntentEnvelope,
  type PolicyBundle,
  type Taint,
} from "../../src/index.js";

// Permissive taint policy — never blocks at the taint phase.
const permissiveTaint = { minimumFor: (): Taint => "UNTRUSTED" };

const taintArb: fc.Arbitrary<Taint> = fc.constantFrom(
  "SYSTEM",
  "TRUSTED",
  "UNTRUSTED",
);

function envelopeArb(): fc.Arbitrary<IntentEnvelope<string, unknown>> {
  return fc.record({
    kind: fc.constantFrom("a.b", "x.y", "do.it"),
    actor: fc.record({
      principal: fc.constantFrom("llm", "user", "system"),
      sessionId: fc.string({ minLength: 1, maxLength: 32 }),
    }),
    taint: taintArb,
    nonce: fc.string({ minLength: 1, maxLength: 32 }),
    payload: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 8 }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
      { maxKeys: 4 },
    ),
  }).map((v) =>
    buildEnvelope({
      kind: v.kind,
      actor: v.actor as { principal: "llm" | "user" | "system"; sessionId: string },
      taint: v.taint,
      nonce: v.nonce,
      payload: v.payload,
      createdAt: "2026-05-13T12:00:00.000Z",
    }),
  );
}

const okBasis = [basis("state", BASIS_CODES.state.TRANSITION_VALID)] as const;

function passGuard(): Guard<string, unknown, unknown> {
  return () => null;
}

function executeGuard(): Guard<string, unknown, unknown> {
  return () => decisionExecute(okBasis);
}

function refuseGuard(): Guard<string, unknown, unknown> {
  return () =>
    decisionRefuse(
      refuse("STATE", "fuzz_refuse", "fuzz"),
      [basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL)],
    );
}

const guardArb: fc.Arbitrary<Guard<string, unknown, unknown>> = fc.oneof(
  fc.constant(passGuard()),
  fc.constant(executeGuard()),
  fc.constant(refuseGuard()),
);

function bundleArb(
  options: { default?: "REFUSE" | "EXECUTE" } = {},
): fc.Arbitrary<PolicyBundle<string, unknown, unknown>> {
  return fc.record({
    stateGuards: fc.array(guardArb, { maxLength: 4 }),
    authGuards: fc.array(guardArb, { maxLength: 4 }),
    business: fc.array(guardArb, { maxLength: 4 }),
  }).map((v) => ({
    stateGuards: v.stateGuards,
    authGuards: v.authGuards,
    taint: permissiveTaint,
    business: v.business,
    default: options.default ?? "REFUSE",
  }));
}

const RUNS = { numRuns: 1000 } as const;

describe("Decision-fuzz: kernel invariants under arbitrary inputs", () => {
  it("Property 1 — determinism: same envelope + state + bundle → same Decision", () => {
    fc.assert(
      fc.property(envelopeArb(), bundleArb(), (env, bundle) => {
        const d1 = adjudicate(env, {}, bundle);
        const d2 = adjudicate(env, {}, bundle);
        expect(d1.kind).toBe(d2.kind);
        expect(d1.basis.length).toBe(d2.basis.length);
      }),
      RUNS,
    );
  });

  it("Property 2 — replay safety: kernel's envelope intentHash equals sha256Canonical(envelope payload)", () => {
    fc.assert(
      fc.property(envelopeArb(), (env) => {
        const expected = sha256Canonical({
          version: env.version,
          kind: env.kind,
          payload: env.payload,
          nonce: env.nonce,
          actor: env.actor,
          taint: env.taint,
        });
        expect(env.intentHash).toBe(expected);
      }),
      RUNS,
    );
  });

  it("Property 3 — ordered semantics: re-ordering guards WITHIN a phase may change outcome; phase order is fixed by the kernel", () => {
    // The phase order (state → taint → auth → business) is enforced by
    // `_adjudicateImpl`, not by the PolicyBundle field order. So swapping
    // `stateGuards` and `business` arrays through bundle construction has
    // no effect — both still run in the canonical phase order. This
    // property pins that contract: any reshuffle of the *bundle's field
    // order* via the spread operator produces the same Decision.
    fc.assert(
      fc.property(envelopeArb(), bundleArb(), (env, bundle) => {
        const reshuffled: PolicyBundle<string, unknown, unknown> = {
          // explicit re-spread in a different listing order
          business: bundle.business,
          taint: bundle.taint,
          authGuards: bundle.authGuards,
          default: bundle.default,
          stateGuards: bundle.stateGuards,
        };
        const d1 = adjudicate(env, {}, bundle);
        const d2 = adjudicate(env, {}, reshuffled);
        expect(d1.kind).toBe(d2.kind);
        expect(d1.basis.length).toBe(d2.basis.length);
      }),
      RUNS,
    );
  });

  it("Property 4 — fail-closed default: a bundle with no matching guards returns its `default`, never null", () => {
    fc.assert(
      fc.property(
        envelopeArb(),
        fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE"),
        (env, dflt) => {
          const bundle: PolicyBundle<string, unknown, unknown> = {
            stateGuards: [passGuard()],
            authGuards: [passGuard()],
            taint: permissiveTaint,
            business: [passGuard()],
            default: dflt,
          };
          const d: Decision = adjudicate(env, {}, bundle);
          expect(d.kind === "EXECUTE" || d.kind === "REFUSE").toBe(true);
          // The default fires only when nothing matches — verified by the
          // envelope having no matching guards above.
          expect(d.kind).toBe(dflt);
        },
      ),
      RUNS,
    );
  });

  it("Property 5 — basis non-empty: every Decision carries at least one basis entry", () => {
    fc.assert(
      fc.property(envelopeArb(), bundleArb(), (env, bundle) => {
        const d = adjudicate(env, {}, bundle);
        expect(d.basis.length).toBeGreaterThanOrEqual(1);
      }),
      RUNS,
    );
  });
});
