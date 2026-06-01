/**
 * Invariant: Basis vocabulary purity.
 *
 * Every basis.code in every Decision returned by adjudicate() MUST belong to
 * BASIS_CODES[basis.category]. No free-form strings at runtime.
 *
 * This catches drift before it reaches an audit sink: if an adopter's guard
 * emits `{ category: "auth", code: "scope_ok" }` instead of
 * `BASIS_CODES.auth.SCOPE_SUFFICIENT`, this test fails.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  isKnownBasisCode,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");

const kindArb = fc.constantFrom(
  "order.tool.propose",
  "payment.send",
  "cart.update",
  "browse",
);

const taintPolicy: TaintPolicy = {
  minimumFor: (k) => (k === "payment.send" ? "SYSTEM" : "UNTRUSTED"),
};

// TestReviewer-008: fuzz with deeply-nested JSON-safe payloads instead of the
// trivial { x: 1 }; coverage comes from payload SHAPE. numRuns capped at 1_000
// (recursive payloads are heavier than a flat scalar — same cap as
// v2-hash-stability).
function env(
  kind: string,
  taint: Taint,
  payload: Record<string, unknown>,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

const emptyBundle: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: taintPolicy,
  business: [],
  default: "EXECUTE",
};

describe("invariant: every basis.code is in BASIS_CODES", () => {
  it("holds for EXECUTE decisions", () => {
    fc.assert(
      fc.property(kindArb, taintArb, jsonSafePayloadArb, (kind, taint, payload) => {
        const decision = adjudicate(env(kind, taint, payload), {}, emptyBundle);
        for (const b of decision.basis) {
          expect(isKnownBasisCode(b)).toBe(true);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds for REFUSE decisions from every failure path", () => {
    fc.assert(
      fc.property(kindArb, taintArb, jsonSafePayloadArb, (kind, taint, payload) => {
        const decision = adjudicate(
          env(kind, taint, payload),
          {},
          { ...emptyBundle, default: "REFUSE" },
        );
        for (const b of decision.basis) {
          expect(isKnownBasisCode(b)).toBe(true);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds for schema-version refusals", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        kindArb,
        jsonSafePayloadArb,
        (badVersion, kind, payload) => {
          const base = env(kind, "SYSTEM", payload);
          const decision = adjudicate(
            { ...base, version: badVersion as 1 },
            {},
            emptyBundle,
          );
          for (const b of decision.basis) {
            expect(isKnownBasisCode(b)).toBe(true);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
