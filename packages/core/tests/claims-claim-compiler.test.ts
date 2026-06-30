/**
 * inv.18 v2 — the ClaimDefinition COMPILER unit + cross-validation harness.
 *
 * Proves the five owner constraints for the slice:
 *   (1) the compiler is a small declarative fold — it generates EVERY artifact from
 *       ONE source (registry spec / projections / template / def / closure / doc /
 *       fixtures) with no per-type code;
 *   (2)+(3) the invariants are DERIVED: the const-generic `defineClaim` builder makes
 *       an un-§5-gated valueBinding.key (INV-7), an empty requiredEvidence (INV-6),
 *       and an inconsistent falsifier stance (INV-2) COMPILE errors — verified by
 *       `@ts-expect-error` negative probes;
 *   (5) GENERATE-don't-handwrite: the GENERATED mutation fixtures, fed back through
 *       the v1 validator, each reject with their matching code, and the generated
 *       valid definition validates — closing the loop compiler → validator.
 */

import { describe, expect, it } from "vitest";
import {
  type CompiledArtifacts,
  compileClaimDefinition,
  defineClaim,
  isFalsifierSetMonotone,
  lit,
  prop,
  validateClaimDefinition,
  validateClaimDefinitions,
} from "@adjudicate/core";

// ── A worked source (the same shape the STORE_OPEN_NOW slice authors) ─────────
const SOURCE = defineClaim({
  type: "STORE_OPEN_NOW",
  version: 1,
  kind: "read_claim",
  triadScoped: true,
  customerScoped: false,
  minSourceIntegrity: "trusted_service",
  requiredEvidence: [
    {
      key: "schedule:store_open_now",
      ownershipPolicy: "not_applicable",
      freshnessPolicy: { kind: "cacheable", ttl: 3600 },
      sourceIntegrity: "trusted_service",
      provenancePolicy: "preserve",
    },
  ],
  valueBinding: { key: "schedule:store_open_now", path: ["mealPeriod"] },
  falsifierComplete: true,
  falsifiers: [
    {
      key: "schedule:schedule_override",
      ownershipPolicy: "not_applicable",
      freshnessPolicy: "must_read_this_turn",
      sourceIntegrity: "trusted_service",
      provenancePolicy: "preserve",
    },
  ],
  render: {
    validated: [
      lit("No momento, o período de funcionamento é: "),
      prop("mealPeriod"),
      lit("."),
    ],
  },
  decomposition: {
    spanClass: "STORE_OPEN_NOW_Q",
    markers: [/abert/, /fechad/, /que horas/, /funciona/, /hor[áa]rio/],
    requires: ["STORE_OPEN_NOW"],
  },
});

describe("claim-compiler — generates the full runtime image from ONE source", () => {
  const out: CompiledArtifacts = compileClaimDefinition(SOURCE);

  it("stamps a versioned id onto the artifacts (designed-in versioning)", () => {
    expect(out.id).toBe("STORE_OPEN_NOW@1");
    expect(out.version).toBe(1);
  });

  it("(1) projects the registry spec", () => {
    expect(out.registrySpec.kind).toBe("read_claim");
    expect(out.registrySpec.customerScoped).toBe(false);
    expect(out.registrySpec.falsifierComplete).toBe(true);
    expect(out.registrySpec.falsifiers).toHaveLength(1);
    expect(out.registrySpec.valueBinding).toEqual({
      key: "schedule:store_open_now",
      path: ["mealPeriod"],
    });
  });

  it("(2) DERIVES the value projection from valueBinding × the render prop (INV-1)", () => {
    // The contributor wrote `prop('mealPeriod')` and `valueBinding.key` ONCE; the
    // projection is COMPUTED — alignment true by construction, not authored twice.
    expect(out.valueProjections).toEqual([
      { field: "mealPeriod", key: "schedule:store_open_now", path: ["mealPeriod"] },
    ]);
  });

  it("(3) fills claimType = self on every render proposition slot", () => {
    expect(out.renderTemplate?.slots).toEqual([
      { kind: "LITERAL", text: "No momento, o período de funcionamento é: " },
      { kind: "PROPOSITION", claimType: "STORE_OPEN_NOW", field: "mealPeriod" },
      { kind: "LITERAL", text: "." },
    ]);
  });

  it("(7) projects the decomposition closure + markers (DATA, not code)", () => {
    expect(out.closure?.spanClass).toBe("STORE_OPEN_NOW_Q");
    expect(out.closure?.requires).toEqual(["STORE_OPEN_NOW"]);
    expect(out.closure?.markers.map((m) => m.source)).toContain("abert");
  });

  it("(6) emits a generated, clearly-marked doc card", () => {
    expect(out.doc).toContain("# Claim type: STORE_OPEN_NOW@1");
    expect(out.doc).toContain("GENERATED");
  });
});

describe("claim-compiler — (5) generated fixtures close the loop into the v1 validator", () => {
  const out = compileClaimDefinition(SOURCE);

  it("the generated VALID definition validates (with its cross-tables)", () => {
    const r = validateClaimDefinitions(
      { STORE_OPEN_NOW: out.definition },
      {
        templates: { STORE_OPEN_NOW: out.renderTemplate },
        closures: { STORE_OPEN_NOW_Q: out.closure?.requires ?? [] },
        registryEnum: ["STORE_OPEN_NOW"],
      },
    );
    expect(r).toEqual({ ok: true });
  });

  it("each GENERATED mutation fixture rejects with its matching invariant code", () => {
    expect(out.fixtures.mutations.length).toBeGreaterThanOrEqual(4);
    for (const m of out.fixtures.mutations) {
      const r = validateClaimDefinition(m.def);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe(m.code);
    }
  });
});

describe("claim-compiler — (4) versioning monotone-safety guard (DERIVED)", () => {
  it("an APPEND-ONLY falsifier set across versions is monotone-safe", () => {
    const v1 = compileClaimDefinition(SOURCE).registrySpec;
    const v2 = compileClaimDefinition(
      defineClaim({
        ...SOURCE,
        version: 2,
        falsifierComplete: true,
        falsifiers: [
          ...SOURCE.falsifiers,
          {
            key: "schedule:emergency_closure",
            ownershipPolicy: "not_applicable",
            freshnessPolicy: "must_read_this_turn",
            sourceIntegrity: "trusted_service",
            provenancePolicy: "preserve",
          },
        ],
      }),
    ).registrySpec;
    expect(isFalsifierSetMonotone(v1, v2)).toBe(true);
    // …but REMOVING a falsifier (a breaking relaxation) is NOT monotone-safe.
    expect(isFalsifierSetMonotone(v2, v1)).toBe(false);
  });
});

describe("claim-compiler — (2)+(3) illegal states are UNREPRESENTABLE (compile-time)", () => {
  it("a valueBinding.key outside requiredEvidence is a COMPILE error (INV-7)", () => {
    defineClaim({
      type: "T",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      requiredEvidence: [
        {
          key: "gated_key",
          ownershipPolicy: "not_applicable",
          freshnessPolicy: "static",
          sourceIntegrity: "structured",
          provenancePolicy: "preserve",
        },
      ],
      // @ts-expect-error — "ungated_key" is not a member of requiredEvidence keys (INV-7).
      valueBinding: { key: "ungated_key" },
    });
    expect(true).toBe(true); // the assertion IS the @ts-expect-error above.
  });

  it("an empty requiredEvidence tuple is a COMPILE error (INV-6)", () => {
    defineClaim({
      type: "T",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      // @ts-expect-error — requiredEvidence must be a NON-EMPTY tuple (INV-6).
      requiredEvidence: [],
    });
    expect(true).toBe(true);
  });

  it("falsifierComplete: true with no falsifiers is a COMPILE error (INV-2)", () => {
    defineClaim({
      type: "T",
      version: 1,
      kind: "read_claim",
      minSourceIntegrity: "structured",
      requiredEvidence: [
        {
          key: "k",
          ownershipPolicy: "not_applicable",
          freshnessPolicy: "static",
          sourceIntegrity: "structured",
          provenancePolicy: "preserve",
        },
      ],
      // @ts-expect-error — falsifierComplete:true STRUCTURALLY requires non-empty falsifiers (INV-2).
      falsifierComplete: true,
    });
    expect(true).toBe(true);
  });
});
