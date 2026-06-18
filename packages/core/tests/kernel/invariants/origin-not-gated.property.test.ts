/**
 * Invariant (041): `origin` is STAMPED and HASHED but consulted by NO guard.
 *
 * Plan 041 adds the harness-stamped `origin` provenance source axis to the
 * envelope and binds it into the `intentHash` pre-image — but it is NOT yet a
 * gate input. The kernel's taint gate is UNCHANGED: it calls envelope-level
 * `canPropose(envelope.taint, envelope.kind, policy.taint)` (adjudicate.ts),
 * never `origin`. The contaminating propagation gate that CONSUMES `origin`
 * is plan 042; until then 041 must be NEITHER more restrictive NOR more
 * permissive than the pre-041 kernel.
 *
 * This invariant proves the no-decision-change property by the only
 * outcome-level test that matters: two envelopes that differ in NOTHING but
 * `origin` (same kind/payload/nonce/actor/taint) must produce the SAME
 * Decision — same kind, same basis — under any policy. If `origin` ever
 * leaked into a guard, this property would break the moment the two origins
 * diverged. It also pins that `PROPAGATION_VIOLATION` is never emitted from
 * an origin difference in 041 (it is reserved for 042).
 *
 * It additionally pins replay byte-identity (§D #5) with the new field
 * recorded: the same recorded inputs (now including `origin`) re-derive the
 * exact stored `intentHash`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  deriveIntentHash,
  type IntentEnvelope,
  type Origin,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const ORIGINS: readonly Origin[] = [
  "Human",
  "Retrieved",
  "ExternalAPI",
  "LLM",
  "System",
];
const originArb = fc.constantFrom<Origin>(...ORIGINS);
const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const kindArb = fc.constantFrom("order.submit", "pix.send", "kyc.review");

// A SYSTEM-min policy makes the taint gate maximally load-bearing; default
// EXECUTE makes any leak maximally adversarial.
function bundle(
  minimum: Taint,
  def: "REFUSE" | "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  const taint: TaintPolicy = { minimumFor: () => minimum };
  return {
    stateGuards: [],
    authGuards: [],
    taint,
    business: [],
    default: def,
  };
}

function envWithOrigin(
  kind: string,
  taint: Taint,
  payload: Record<string, unknown>,
  origin: Origin,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-origin-inv",
    createdAt: "2026-04-23T12:00:00.000Z",
    origin,
  });
}

describe("invariant 041: origin is stamped+hashed but NOT a gate input", () => {
  it("origin never changes the Decision (same everything-but-origin → same decision)", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        jsonSafePayloadArb,
        originArb,
        originArb,
        fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED"),
        fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE"),
        (kind, taint, payload, originA, originB, minimum, def) => {
          const b = bundle(minimum, def);
          const dA = adjudicate(
            envWithOrigin(kind, taint, payload as Record<string, unknown>, originA),
            {},
            b,
          );
          const dB = adjudicate(
            envWithOrigin(kind, taint, payload as Record<string, unknown>, originB),
            {},
            b,
          );
          // Origin is invisible to the gate: identical decision kind + basis.
          expect(dA.kind).toBe(dB.kind);
          expect(dA.basis.map((x) => `${x.category}:${x.code}`)).toEqual(
            dB.basis.map((x) => `${x.category}:${x.code}`),
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("no origin difference ever emits a taint:propagation_violation (reserved for 042)", () => {
    fc.assert(
      fc.property(kindArb, taintArb, originArb, (kind, taint, origin) => {
        const decision = adjudicate(
          envWithOrigin(kind, taint, { x: 1 }, origin),
          {},
          bundle("SYSTEM", "EXECUTE"),
        );
        expect(
          decision.basis.some(
            (x) => x.category === "taint" && x.code === "propagation_violation",
          ),
        ).toBe(false);
      }),
      { numRuns: 1_000 },
    );
  });

  it("replay byte-identity holds with origin recorded (§D #5): stored intentHash re-derives", () => {
    fc.assert(
      fc.property(kindArb, taintArb, jsonSafePayloadArb, originArb, (kind, taint, payload, origin) => {
        const env = envWithOrigin(kind, taint, payload as Record<string, unknown>, origin);
        // Re-derivation over the recorded inputs (now including origin) is
        // byte-identical to the stored hash.
        expect(deriveIntentHash(env)).toBe(env.intentHash);
      }),
      { numRuns: 1_000 },
    );
  });
});
