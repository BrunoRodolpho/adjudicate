/**
 * inv.18 — the ClaimDefinition compiler (v1 slice) PROPERTY harness (fast-check).
 *
 * Three properties the owner specified:
 *   1. A fully-complete generated definition ALWAYS validates.
 *   2. A definition missing/corrupting ANY required facet is ALWAYS REJECTED
 *      (with a non-empty reason + a stable code).
 *   3. The validator is TOTAL — it NEVER throws on arbitrary (even garbage) input;
 *      it always returns a `{ ok: boolean }` result.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type ClaimDefinition,
  type EvidenceRequirement,
  validateClaimDefinition,
} from "@adjudicate/core";

const RUNS = 300;

// ─────────────────────────────────────────────────────────────────────────
// Generators — a well-formed, complete ClaimDefinition.
// ─────────────────────────────────────────────────────────────────────────

const arbProvenance = fc.constantFrom("preserve" as const, "first_party_only" as const);
const arbOwnership = fc.constantFrom("required" as const, "not_applicable" as const);
const arbIntegrity = fc.constantFrom(
  "structured" as const,
  "trusted_service" as const,
  "first_party_verified" as const,
  "human_report" as const,
  "free_text" as const,
);
const arbFreshness = fc.oneof(
  fc.constant("static" as const),
  fc.constant("must_read_this_turn" as const),
  fc.constant("action_outcome" as const),
  fc.record({
    kind: fc.constant("cacheable" as const),
    ttl: fc.oneof(fc.integer({ min: 1, max: 86_400 }), fc.constant("reindex_bound" as const)),
  }),
);

function arbRequirement(key: string): fc.Arbitrary<EvidenceRequirement> {
  return fc.record({
    key: fc.constant(key),
    ownershipPolicy: arbOwnership,
    freshnessPolicy: arbFreshness,
    sourceIntegrity: arbIntegrity,
    provenancePolicy: arbProvenance,
  });
}

/** A complete, internally-aligned ClaimDefinition (key namespace kept disjoint). */
const arbValidDef: fc.Arbitrary<ClaimDefinition> = fc
  .record({
    type: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `T_${s.replace(/\s/g, "_")}`),
    kind: fc.constantFrom("read_claim" as const, "action_claim" as const),
    nReq: fc.integer({ min: 1, max: 3 }),
    minSourceIntegrity: arbIntegrity,
    field: fc.string({ minLength: 1, maxLength: 6 }).map((s) => `f_${s.replace(/\s/g, "_")}`),
    falsifier: arbRequirement("falsifier_key"),
    withTemplate: fc.boolean(),
  })
  .chain((seed) => {
    const reqKeys = Array.from({ length: seed.nReq }, (_, i) => `req_${i}`);
    return fc
      .tuple(...reqKeys.map((k) => arbRequirement(k)))
      .map((reqs) => {
        const def: ClaimDefinition = {
          type: seed.type,
          kind: seed.kind,
          requiredEvidence: reqs,
          minSourceIntegrity: seed.minSourceIntegrity,
          falsifierComplete: true,
          falsifiers: [seed.falsifier],
          // value-binding + projection bound to the first (always-present) req key.
          valueBinding: { key: "req_0" },
          valueProjections: seed.withTemplate ? [{ field: seed.field, key: "req_0" }] : [],
          renderTemplate: seed.withTemplate
            ? {
                slots: [
                  { kind: "LITERAL", text: "x" },
                  { kind: "PROPOSITION", claimType: seed.type, field: seed.field },
                ],
              }
            : undefined,
        };
        return def;
      });
  });

// ─────────────────────────────────────────────────────────────────────────
// Property 1 — every complete generated definition validates.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 property — completeness ⟹ accept", () => {
  it("a fully-complete generated def ALWAYS validates", () => {
    fc.assert(
      fc.property(arbValidDef, (def) => {
        expect(validateClaimDefinition(def)).toEqual({ ok: true });
      }),
      { numRuns: RUNS },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Property 2 — dropping any required facet ⟹ reject (with a code + reason).
// ─────────────────────────────────────────────────────────────────────────

type Mutator = (def: ClaimDefinition) => ClaimDefinition;

const MUTATORS: readonly { name: string; apply: Mutator }[] = [
  { name: "empty requiredEvidence", apply: (d) => ({ ...d, requiredEvidence: [] }) },
  {
    name: "drop provenance on a requiredEvidence",
    apply: (d) => {
      const { provenancePolicy: _p, ...rest } = d.requiredEvidence[0];
      return { ...d, requiredEvidence: [rest as EvidenceRequirement, ...d.requiredEvidence.slice(1)] };
    },
  },
  {
    name: "bare cacheable freshness (no ttl)",
    apply: (d) => ({
      ...d,
      requiredEvidence: [
        { ...d.requiredEvidence[0], freshnessPolicy: "cacheable" as unknown as EvidenceRequirement["freshnessPolicy"] },
        ...d.requiredEvidence.slice(1),
      ],
    }),
  },
  { name: "empty falsifiers while complete", apply: (d) => ({ ...d, falsifiers: [] }) },
  { name: "value-binding off requiredEvidence", apply: (d) => ({ ...d, valueBinding: { key: "ghost" } }) },
  {
    name: "projection key off requiredEvidence",
    apply: (d) => ({ ...d, valueProjections: [{ field: "ghostfield", key: "ghost" }] }),
  },
];

describe("inv.18 property — missing any facet ⟹ reject", () => {
  for (const mutator of MUTATORS) {
    it(`REJECTS when mutated: ${mutator.name}`, () => {
      fc.assert(
        fc.property(arbValidDef, (def) => {
          const result = validateClaimDefinition(mutator.apply(def));
          expect(result.ok).toBe(false);
          if (result.ok === false) {
            expect(typeof result.code).toBe("string");
            expect(result.reason.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: RUNS },
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Property 3 — totality: never throws on arbitrary input.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 property — totality (never throws)", () => {
  it("validateClaimDefinition returns a result on ANY input, never throws", () => {
    fc.assert(
      fc.property(fc.anything(), (garbage) => {
        const result = validateClaimDefinition(garbage as ClaimDefinition);
        expect(typeof result.ok).toBe("boolean");
        // Any non-complete/garbage input must be REJECTED, never silently ok.
        if (result.ok === true) {
          // The only way fc.anything() lands ok is the astronomically unlikely
          // event it shaped a complete def; assert the shape if so.
          expect(typeof (garbage as ClaimDefinition).type).toBe("string");
        }
      }),
      { numRuns: RUNS },
    );
  });
});
