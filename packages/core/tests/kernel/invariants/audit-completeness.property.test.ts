/**
 * Invariant: Audit completeness.
 *
 * Every Decision returned by adjudicate() carries a non-empty basis array.
 * No silent decisions — an auditor should always see what was checked.
 *
 * Additionally: every buildAuditRecord(envelope, decision, ...) produces a
 * record whose decision_basis matches the decision's basis. The two must
 * never diverge.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildAuditRecord,
  buildEnvelope,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const defaultArb = fc.constantFrom<"REFUSE" | "EXECUTE">("REFUSE", "EXECUTE");

// TestReviewer-008: fuzz with deeply-nested JSON-safe payloads instead of the
// trivial { x: 1 }. The envelope builder takes the generated payload; numRuns is
// capped at 1_000 (recursive payloads are heavier than a flat scalar — same cap
// as v2-hash-stability) and coverage comes from payload SHAPE.
function env(
  taint: Taint,
  payload: Record<string, unknown>,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind: "order.tool.propose",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

const permissiveTaint: TaintPolicy = { minimumFor: () => "UNTRUSTED" };

function bundle(
  def: "REFUSE" | "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: permissiveTaint,
    business: [],
    default: def,
  };
}

describe("invariant: every decision carries a non-empty basis", () => {
  it("holds across taint × default matrix", () => {
    fc.assert(
      fc.property(taintArb, defaultArb, jsonSafePayloadArb, (taint, def, payload) => {
        const decision = adjudicate(env(taint, payload), {}, bundle(def));
        expect(decision.basis.length).toBeGreaterThan(0);
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: audit record basis matches decision basis", () => {
  it("decision_basis === decision.basis for every produced record", () => {
    fc.assert(
      fc.property(taintArb, defaultArb, jsonSafePayloadArb, (taint, def, payload) => {
        const decision = adjudicate(env(taint, payload), {}, bundle(def));
        const record = buildAuditRecord({
          envelope: env(taint, payload),
          decision,
          durationMs: 1,
        });
        expect(record.decision_basis).toEqual(decision.basis);
      }),
      { numRuns: 1_000 },
    );
  });
});
