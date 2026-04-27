/**
 * Invariant: replay determinism — `adjudicate()` is a pure function of
 * `(envelope, state, policy)`. Re-adjudicating any stored AuditRecord
 * with the SAME policy produces a Decision whose flat-set basis matches
 * the stored basis. The replay classifier reports zero mismatches in
 * that case, which is the load-bearing claim of the replay harness.
 *
 * The classify rule is duplicated inline here to avoid a package-graph
 * cycle (this property test lives in `@adjudicate/core`; `classify`
 * lives in `@adjudicate/audit` which already depends on core). The
 * exported `classify` function is invariant-tested separately in
 * `packages/audit/tests/replay.test.ts`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  basis,
  BASIS_CODES,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
  decisionRefuse,
  refuse,
  type Decision,
  type DecisionBasis,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defaultArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");

function env(taint: Taint, seed: string): IntentEnvelope<string, { x: string }> {
  return buildEnvelope<string, { x: string }>({
    kind: "order.tool.propose",
    payload: { x: seed },
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function bundle(
  def: "REFUSE" | "EXECUTE",
  withGuards: "none" | "execute-guard" | "refuse-guard",
): PolicyBundle<string, unknown, unknown> {
  const business =
    withGuards === "execute-guard"
      ? [
          () =>
            decisionExecute([
              basis("business", BASIS_CODES.business.RULE_SATISFIED),
            ]),
        ]
      : withGuards === "refuse-guard"
        ? [
            () =>
              decisionRefuse(
                refuse("BUSINESS_RULE", "x.do.invalid", "no"),
                [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
              ),
          ]
        : [];
  return {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business,
    default: def,
  };
}

const guardArb = fc.constantFrom<"none" | "execute-guard" | "refuse-guard">(
  "none",
  "execute-guard",
  "refuse-guard",
);

function flat(basis: readonly DecisionBasis[]): readonly string[] {
  return basis.map((b) => `${b.category}:${b.code}`).sort();
}

/**
 * Inline classifier — same rule as `@adjudicate/audit/replay.classify`,
 * duplicated here to avoid a package-graph cycle. Returns true iff the
 * two Decisions match by kind + flat-set basis (+ refusal.code on REFUSE).
 */
function decisionsMatch(a: Decision, b: Decision): boolean {
  if (a.kind !== b.kind) return false;
  const flatA = flat(a.basis);
  const flatB = flat(b.basis);
  if (flatA.length !== flatB.length) return false;
  for (let i = 0; i < flatA.length; i++) {
    if (flatA[i] !== flatB[i]) return false;
  }
  if (a.kind === "REFUSE" && b.kind === "REFUSE") {
    if (a.refusal.code !== b.refusal.code) return false;
  }
  return true;
}

describe("invariant: replay matches the stored Decision when policy is unchanged", () => {
  it("decisionsMatch(stored, replay) for any (taint × default × guard × payload)", () => {
    fc.assert(
      fc.property(
        taintArb,
        defaultArb,
        guardArb,
        fc.string({ minLength: 1, maxLength: 12 }),
        (taint, def, guard, seed) => {
          const policy = bundle(def, guard);
          const envelope = env(taint, seed);
          const decision = adjudicate(envelope, {}, policy);
          const stored = buildAuditRecord({
            envelope,
            decision,
            durationMs: 1,
          });
          // Replay through the same policy.
          const replayed = adjudicate(stored.envelope, {}, policy);
          expect(decisionsMatch(decision, replayed)).toBe(true);
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
