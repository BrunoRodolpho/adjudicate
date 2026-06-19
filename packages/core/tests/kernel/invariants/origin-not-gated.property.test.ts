/**
 * Invariant (041 → evolved by 042): `origin` is STAMPED and HASHED, and is
 * consulted by the kernel ONLY to ATTRIBUTE a taint-gate refusal — never to
 * change the Decision KIND, never to weaken a gate.
 *
 * Plan 041 added the harness-stamped `origin` provenance source axis, bound it
 * into the `intentHash` pre-image, and consulted it from NO guard. Plan 042 (this
 * file's chartered evolution) makes the kernel read `origin` read-only at the
 * taint gate to choose the basis CODE on an ALREADY-FAILING `canPropose` refusal:
 * a contaminating origin (Retrieved / ExternalAPI) populates the previously-unused
 * `taint:propagation_violation` basis so audit can distinguish a contamination-
 * lowered refusal from a bare declared-untrusted one. This is NOT a new outcome
 * (still REFUSE), NOT a new guard phase, and NOT a friction change — the Decision
 * KIND remains origin-invariant.
 *
 * The properties below pin the 042-evolved contract precisely:
 *   1. origin NEVER changes the Decision KIND (no EXECUTE↔REFUSE flip).
 *   2. `propagation_violation` is emitted ONLY on a taint-gate REFUSE AND ONLY
 *      for a contaminating origin — never on an EXECUTE, never for a
 *      non-contaminating origin (Human / System / LLM).
 *   3. replay byte-identity (§D #5) holds with `origin` recorded.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  deriveIntentHash,
  isContaminatingOrigin,
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

describe("invariant 041→042: origin attributes a taint refusal, never changes the outcome", () => {
  it("origin never changes the Decision KIND (same everything-but-origin → same kind)", () => {
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
          // 042: origin can ONLY influence the basis CODE on a taint refusal —
          // never the decision KIND. EXECUTE↔REFUSE is origin-invariant, so a
          // contaminating origin can neither buy an EXECUTE nor manufacture a
          // refusal where the taint gate passes.
          expect(dA.kind).toBe(dB.kind);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("origin leaves the non-taint basis sequence byte-identical (only the taint code may differ)", () => {
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
          // Every basis EXCEPT a taint-category code is identical across origins.
          const nonTaint = (d: typeof dA) =>
            d.basis
              .filter((x) => x.category !== "taint")
              .map((x) => `${x.category}:${x.code}`);
          expect(nonTaint(dA)).toEqual(nonTaint(dB));
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("propagation_violation appears ONLY on a taint REFUSE AND ONLY for a contaminating origin", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        originArb,
        fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED"),
        fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE"),
        (kind, taint, origin, minimum, def) => {
          const decision = adjudicate(
            envWithOrigin(kind, taint, { x: 1 }, origin),
            {},
            bundle(minimum, def),
          );
          const hasPropagation = decision.basis.some(
            (x) => x.category === "taint" && x.code === "propagation_violation",
          );
          if (hasPropagation) {
            // Only ever on a REFUSE produced by the taint gate ...
            expect(decision.kind).toBe("REFUSE");
            // ... and only for a contaminating origin.
            expect(isContaminatingOrigin(origin)).toBe(true);
          }
          // A non-contaminating origin NEVER emits propagation_violation.
          if (!isContaminatingOrigin(origin)) {
            expect(hasPropagation).toBe(false);
          }
          // An EXECUTE NEVER carries a propagation_violation basis.
          if (decision.kind === "EXECUTE") {
            expect(hasPropagation).toBe(false);
          }
        },
      ),
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
