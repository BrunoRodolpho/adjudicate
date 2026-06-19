/**
 * Invariant (043): the origin-aware policy branch at the kernel taint gate is
 * MONOTONIC (only ever adds friction) and DARK by default (a policy without
 * `requiresUncontaminatedOrigin` — or one that returns false — is byte-identical
 * to pre-043).
 *
 * Plan 043 evolves the single taint-gate call from `canPropose` to
 * `canProposeWithOrigin`, letting the injected `policy.taint` RAISE the effective
 * minimum for a kind it declares origin-required when the harness-stamped
 * envelope `origin` (041, already in the intentHash pre-image) is contaminating
 * (Retrieved / ExternalAPI). This is the REAL per-intent propagation gate (042
 * only ATTRIBUTED a refusal that the trust-rank floor already produced); it
 * actually FLIPS an UNTRUSTED-min mutating kind whose `1 >= 1` rank check always
 * passes into a REFUSE attributed to `taint:propagation_violation`.
 *
 * The properties below pin the 043 contract:
 *   1. MONOTONIC (§C / invariant #7): the origin branch never relaxes a
 *      decision. For ANY (kind, taint, origin), an origin-aware policy NEVER
 *      yields EXECUTE where its rank-equivalent (origin-blind) policy REFUSEd —
 *      it can only flip an EXECUTE to a REFUSE, never the reverse.
 *   2. DARK by default: a policy with NO `requiresUncontaminatedOrigin` produces
 *      a decision byte-identical (same kind + same basis sequence) to a plain
 *      `{ minimumFor }` policy — origin-blind behavior is preserved exactly.
 *   3. propagation_violation with the 043 `origin_required` branch marker appears
 *      ONLY on a taint REFUSE the rank floor would have PASSED AND ONLY for a
 *      contaminating origin — never on an EXECUTE, never for a clean origin.
 *   4. replay byte-identity (§D #5) holds (no new field enters the hash).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  canPropose,
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
const minimumArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");

function bundleWith(
  taint: TaintPolicy,
  def: "REFUSE" | "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint,
    business: [],
    default: def,
  };
}

function env(
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
    nonce: "n-043-inv",
    createdAt: "2026-04-23T12:00:00.000Z",
    origin,
  });
}

describe("invariant 043: origin-aware policy branch is monotonic + dark by default", () => {
  it("(1) MONOTONIC: an origin-aware policy NEVER EXECUTEs where its origin-blind twin REFUSEd", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        jsonSafePayloadArb,
        originArb,
        minimumArb,
        defArb,
        (kind, taint, payload, origin, minimum, def) => {
          // The origin-blind twin: the SAME minimumFor, no origin branch.
          const blind: TaintPolicy = { minimumFor: () => minimum };
          // The origin-aware policy: identical rank floor, PLUS marks every kind
          // origin-required (maximally load-bearing branch).
          const aware: TaintPolicy = {
            minimumFor: () => minimum,
            requiresUncontaminatedOrigin: () => true,
          };
          const p = payload as Record<string, unknown>;
          const dBlind = adjudicate(env(kind, taint, p, origin), {}, bundleWith(blind, def));
          const dAware = adjudicate(env(kind, taint, p, origin), {}, bundleWith(aware, def));
          // Monotonicity: the branch can only ADD friction. If the blind policy
          // EXECUTEd, the aware one is EXECUTE (clean origin) or REFUSE
          // (contaminated) — but if the blind one REFUSEd, the aware one can
          // NEVER be EXECUTE.
          if (dBlind.kind !== "EXECUTE") {
            expect(dAware.kind).not.toBe("EXECUTE");
          }
          // And the branch only diverges (blind EXECUTE → aware REFUSE) for a
          // contaminating origin.
          if (dBlind.kind === "EXECUTE" && dAware.kind !== "EXECUTE") {
            expect(isContaminatingOrigin(origin)).toBe(true);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("(2) DARK by default: a policy with no origin branch is byte-identical to a plain { minimumFor }", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        jsonSafePayloadArb,
        originArb,
        minimumArb,
        defArb,
        (kind, taint, payload, origin, minimum, def) => {
          const plain: TaintPolicy = { minimumFor: () => minimum };
          // A policy that DECLARES the branch method but DISABLES it (returns
          // false) must also be byte-identical — the dark-ship default.
          const disabled: TaintPolicy = {
            minimumFor: () => minimum,
            requiresUncontaminatedOrigin: () => false,
          };
          const p = payload as Record<string, unknown>;
          const a = adjudicate(env(kind, taint, p, origin), {}, bundleWith(plain, def));
          const b = adjudicate(env(kind, taint, p, origin), {}, bundleWith(disabled, def));
          expect(b.kind).toBe(a.kind);
          expect(b.basis.map((x) => `${x.category}:${x.code}`)).toEqual(
            a.basis.map((x) => `${x.category}:${x.code}`),
          );
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("(3) the 043 origin_required branch marker appears ONLY on a rank-PASS REFUSE for a contaminating origin", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        originArb,
        minimumArb,
        defArb,
        (kind, taint, origin, minimum, def) => {
          const aware: TaintPolicy = {
            minimumFor: () => minimum,
            requiresUncontaminatedOrigin: () => true,
          };
          const decision = adjudicate(
            env(kind, taint, { x: 1 }, origin),
            {},
            bundleWith(aware, def),
          );
          const taintBasis = decision.basis.find((x) => x.category === "taint");
          const isOriginBranch = taintBasis?.detail?.branch === "origin_required";
          if (isOriginBranch) {
            // Only ever on a REFUSE ...
            expect(decision.kind).toBe("REFUSE");
            // ... for a contaminating origin ...
            expect(isContaminatingOrigin(origin)).toBe(true);
            // ... the basis code is propagation_violation ...
            expect(taintBasis?.code).toBe("propagation_violation");
            // ... and the rank floor would have PASSED (this is what makes 043
            // distinct from 042's rank-floor attribution).
            expect(canPropose(taint, kind, aware)).toBe(true);
          }
          // An EXECUTE never carries the origin_required branch marker.
          if (decision.kind === "EXECUTE") {
            expect(isOriginBranch).toBe(false);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("(4) replay byte-identity holds (§D #5): no new field enters the hash pre-image", () => {
    fc.assert(
      fc.property(
        kindArb,
        taintArb,
        jsonSafePayloadArb,
        originArb,
        (kind, taint, payload, origin) => {
          const e = env(kind, taint, payload as Record<string, unknown>, origin);
          // 043 reads ONLY the already-bound `origin` + payload provenance — no
          // new field. The stored intentHash re-derives byte-identically.
          expect(deriveIntentHash(e)).toBe(e.intentHash);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
