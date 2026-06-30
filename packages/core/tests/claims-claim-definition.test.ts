/**
 * inv.18 — the ClaimDefinition compiler (v1 slice) UNIT + MUTATION harness.
 *
 * MUTATION TESTING (the owner's explicit ask): take a known-VALID definition and,
 * for EACH facet (requiredEvidence / a falsifier / a value projection / a
 * template-slot binding / the value-binding key / decomposition membership /
 * provenance / template-registration), REMOVE or CORRUPT it and assert the
 * validator REJECTS with the MATCHING failure code. This is the "mutation testing
 * that intentionally removes evidence/falsifiers/projections to confirm the
 * compiler rejects them."
 */

import { describe, expect, it } from "vitest";
import {
  type ClaimDefinition,
  type EvidenceRequirement,
  checkSlotProjectionAlignment,
  validateClaimDefinition,
  validateClaimDefinitions,
} from "@adjudicate/core";

// ─────────────────────────────────────────────────────────────────────────
// A known-VALID baseline definition — every facet present and aligned.
// ─────────────────────────────────────────────────────────────────────────

const storeHours: EvidenceRequirement = {
  key: "store_hours",
  ownershipPolicy: "not_applicable",
  freshnessPolicy: { kind: "cacheable", ttl: 30 },
  sourceIntegrity: "structured",
  provenancePolicy: "preserve",
};

const scheduleOverride: EvidenceRequirement = {
  key: "schedule_override",
  ownershipPolicy: "not_applicable",
  freshnessPolicy: "must_read_this_turn",
  sourceIntegrity: "structured",
  provenancePolicy: "preserve",
};

/** A deep-cloning factory so each mutation test starts from a pristine valid def. */
function validDef(): ClaimDefinition {
  return {
    type: "STORE_OPEN_NOW",
    kind: "read_claim",
    requiredEvidence: [{ ...storeHours }],
    minSourceIntegrity: "structured",
    falsifierComplete: true,
    falsifiers: [{ ...scheduleOverride }],
    valueBinding: { key: "store_hours", path: ["mealPeriod"] },
    valueProjections: [{ field: "mealPeriod", key: "store_hours", path: ["mealPeriod"] }],
    renderTemplate: {
      slots: [
        { kind: "LITERAL", text: "Current meal period: " },
        { kind: "PROPOSITION", claimType: "STORE_OPEN_NOW", field: "mealPeriod" },
      ],
    },
    triadScoped: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Baseline: the valid def + a valid set validate.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 baseline — a fully-complete definition validates", () => {
  it("validateClaimDefinition accepts the known-valid def", () => {
    expect(validateClaimDefinition(validDef())).toEqual({ ok: true });
  });

  it("validateClaimDefinitions accepts the valid def with its cross-tables", () => {
    const def = validDef();
    const result = validateClaimDefinitions(
      { STORE_OPEN_NOW: def },
      {
        templates: { STORE_OPEN_NOW: {} },
        closures: { STORE_STATUS: ["STORE_OPEN_NOW"] },
        registryEnum: ["STORE_OPEN_NOW"],
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it("a def with no template / projections / binding still validates (facets optional)", () => {
    const minimal: ClaimDefinition = {
      type: "MENU_ITEM_ALLERGENS",
      kind: "read_claim",
      requiredEvidence: [{ ...storeHours, key: "allergens" }],
      minSourceIntegrity: "structured",
      falsifierComplete: true,
      falsifiers: [{ ...scheduleOverride, key: "allergen_recall" }],
    };
    expect(validateClaimDefinition(minimal)).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MUTATION tests — remove/corrupt each facet, assert the matching rejection.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 MUTATION — removing/corrupting a facet is REJECTED", () => {
  it("INV-6: REMOVING all requiredEvidence ⟹ EMPTY_REQUIRED_EVIDENCE", () => {
    const def = validDef();
    const mutated = { ...def, requiredEvidence: [] };
    const r = validateClaimDefinition(mutated as ClaimDefinition);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("EMPTY_REQUIRED_EVIDENCE");
  });

  it("INV-5: REMOVING provenancePolicy from a requiredEvidence ⟹ PROVENANCE_DENY", () => {
    const def = validDef();
    const { provenancePolicy: _drop, ...noProv } = def.requiredEvidence[0];
    const mutated = { ...def, requiredEvidence: [noProv] };
    const r = validateClaimDefinition(mutated as unknown as ClaimDefinition);
    expect(r.ok === false && r.code).toBe("PROVENANCE_DENY");
  });

  it("INV-8: CORRUPTING freshness to a bare 'cacheable' (no ttl) ⟹ MALFORMED_EVIDENCE", () => {
    const def = validDef();
    const mutated = {
      ...def,
      requiredEvidence: [{ ...def.requiredEvidence[0], freshnessPolicy: "cacheable" }],
    };
    const r = validateClaimDefinition(mutated as unknown as ClaimDefinition);
    expect(r.ok === false && r.code).toBe("MALFORMED_EVIDENCE");
  });

  it("INV-2: REMOVING falsifiers while falsifierComplete:true ⟹ FALSIFIER_INCOMPLETE", () => {
    const def = validDef();
    const mutated = { ...def, falsifiers: [] };
    const r = validateClaimDefinition(mutated);
    expect(r.ok === false && r.code).toBe("FALSIFIER_INCOMPLETE");
  });

  it("INV-2: DELETING the falsifiers field while falsifierComplete:true ⟹ FALSIFIER_INCOMPLETE", () => {
    const def = validDef();
    const { falsifiers: _drop, ...mutated } = def;
    const r = validateClaimDefinition(mutated as ClaimDefinition);
    expect(r.ok === false && r.code).toBe("FALSIFIER_INCOMPLETE");
  });

  it("INV-5: CORRUPTING a falsifier's provenancePolicy ⟹ PROVENANCE_DENY", () => {
    const def = validDef();
    const mutated = {
      ...def,
      falsifiers: [{ ...def.falsifiers![0], provenancePolicy: "made_up" }],
    };
    const r = validateClaimDefinition(mutated as unknown as ClaimDefinition);
    expect(r.ok === false && r.code).toBe("PROVENANCE_DENY");
  });

  it("INV-7: REPOINTING valueBinding.key off requiredEvidence ⟹ BINDING_KEY_UNGATED", () => {
    const def = validDef();
    const mutated = { ...def, valueBinding: { key: "not_a_required_key" } };
    const r = validateClaimDefinition(mutated);
    expect(r.ok === false && r.code).toBe("BINDING_KEY_UNGATED");
  });

  it("INV-1: REMOVING the value projection that backs the slot ⟹ SLOT_UNBACKED", () => {
    const def = validDef();
    const mutated = { ...def, valueProjections: [] };
    const r = validateClaimDefinition(mutated);
    expect(r.ok === false && r.code).toBe("SLOT_UNBACKED");
  });

  it("INV-1: REPOINTING a projection's key off requiredEvidence ⟹ SLOT_UNBACKED", () => {
    const def = validDef();
    const mutated = {
      ...def,
      valueProjections: [{ field: "mealPeriod", key: "ungated_key" }],
    };
    const r = validateClaimDefinition(mutated);
    expect(r.ok === false && r.code).toBe("SLOT_UNBACKED");
  });

  it("INV-1: a PROPOSITION slot whose field has NO projection ⟹ SLOT_UNBACKED", () => {
    const def = validDef();
    const mutated = {
      ...def,
      renderTemplate: {
        slots: [{ kind: "PROPOSITION" as const, claimType: "STORE_OPEN_NOW", field: "etaMinutes" }],
      },
    };
    const r = validateClaimDefinition(mutated);
    expect(r.ok === false && r.code).toBe("SLOT_UNBACKED");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-3 — the DANGLING TEMPLATE (the ORDER_ESTIMATED_ARRIVAL analog) is REJECTED.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 INV-3 — a template with no registered definition is REJECTED", () => {
  it("a VALIDATED_TEMPLATES entry with no ClaimDefinition ⟹ TEMPLATE_UNREGISTERED", () => {
    const def = validDef();
    // Models the real dangling state: ORDER_ESTIMATED_ARRIVAL has a template but
    // is NOT a member of CLAIM_REGISTRY.
    const r = validateClaimDefinitions(
      { STORE_OPEN_NOW: def },
      {
        templates: { STORE_OPEN_NOW: {}, ORDER_ESTIMATED_ARRIVAL: {} },
        registryEnum: ["STORE_OPEN_NOW"],
      },
    );
    expect(r.ok === false && r.code).toBe("TEMPLATE_UNREGISTERED");
    expect(r.ok === false && r.reason).toContain("ORDER_ESTIMATED_ARRIVAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// INV-4 — decomposition-closure membership (both directions).
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 INV-4 — decomposition closure membership", () => {
  it("a Triad-scoped type absent from every closure ⟹ DECOMPOSITION_UNREACHABLE", () => {
    const def = validDef(); // triadScoped: true
    const r = validateClaimDefinitions(
      { STORE_OPEN_NOW: def },
      { closures: { SOME_OTHER_SPAN: [] }, registryEnum: ["STORE_OPEN_NOW"] },
    );
    expect(r.ok === false && r.code).toBe("DECOMPOSITION_UNREACHABLE");
  });

  it("a closure referencing an unregistered type ⟹ DECOMPOSITION_UNREACHABLE", () => {
    const def = validDef();
    const r = validateClaimDefinitions(
      { STORE_OPEN_NOW: def },
      {
        closures: { STORE_STATUS: ["STORE_OPEN_NOW", "GHOST_TYPE"] },
        registryEnum: ["STORE_OPEN_NOW"],
      },
    );
    expect(r.ok === false && r.code).toBe("DECOMPOSITION_UNREACHABLE");
    expect(r.ok === false && r.reason).toContain("GHOST_TYPE");
  });

  it("a NON-Triad-scoped type may be absent from closures (no obligation)", () => {
    const def = { ...validDef(), triadScoped: false };
    const r = validateClaimDefinitions(
      { STORE_OPEN_NOW: def },
      { closures: { STORE_STATUS: [] }, registryEnum: ["STORE_OPEN_NOW"] },
    );
    expect(r).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Cross-type slot resolution + def-key agreement.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 cross-type slots + key agreement", () => {
  it("a PROPOSITION slot referencing ANOTHER registered type is backed by THAT type's projection", () => {
    const owner: ClaimDefinition = {
      ...validDef(),
      type: "STORE_HOURS",
      renderTemplate: undefined,
    };
    const referer: ClaimDefinition = {
      type: "STORE_OPEN_NOW",
      kind: "read_claim",
      requiredEvidence: [{ ...storeHours, key: "open_now" }],
      minSourceIntegrity: "structured",
      falsifierComplete: true,
      falsifiers: [{ ...scheduleOverride }],
      renderTemplate: {
        slots: [{ kind: "PROPOSITION", claimType: "STORE_HOURS", field: "mealPeriod" }],
      },
    };
    const r = validateClaimDefinitions({ STORE_HOURS: owner, STORE_OPEN_NOW: referer });
    expect(r).toEqual({ ok: true });
  });

  it("a PROPOSITION slot referencing an UNREGISTERED type ⟹ SLOT_UNBACKED", () => {
    const referer: ClaimDefinition = {
      type: "STORE_OPEN_NOW",
      kind: "read_claim",
      requiredEvidence: [{ ...storeHours, key: "open_now" }],
      minSourceIntegrity: "structured",
      falsifierComplete: true,
      falsifiers: [{ ...scheduleOverride }],
      renderTemplate: {
        slots: [{ kind: "PROPOSITION", claimType: "NOT_REGISTERED", field: "x" }],
      },
    };
    const r = validateClaimDefinitions({ STORE_OPEN_NOW: referer });
    expect(r.ok === false && r.code).toBe("SLOT_UNBACKED");
  });

  it("a defs map whose key disagrees with def.type ⟹ MALFORMED_DEFINITION", () => {
    const def = validDef();
    const r = validateClaimDefinitions({ WRONG_KEY: def });
    expect(r.ok === false && r.code).toBe("MALFORMED_DEFINITION");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The reusable slot↔projection predicate.
// ─────────────────────────────────────────────────────────────────────────

describe("inv.18 checkSlotProjectionAlignment (reusable predicate)", () => {
  it("returns ok for a backed self-referential slot", () => {
    expect(checkSlotProjectionAlignment(validDef())).toEqual({ ok: true });
  });

  it("returns ok for a def with no render template (no obligation)", () => {
    const { renderTemplate: _drop, ...noTemplate } = validDef();
    expect(checkSlotProjectionAlignment(noTemplate as ClaimDefinition)).toEqual({ ok: true });
  });

  it("rejects an unbacked PROPOSITION slot", () => {
    const def = { ...validDef(), valueProjections: [] };
    const r = checkSlotProjectionAlignment(def);
    expect(r.ok === false && r.code).toBe("SLOT_UNBACKED");
  });

  it("a LITERAL-only template imposes no backing obligation", () => {
    const def: ClaimDefinition = {
      ...validDef(),
      valueProjections: [],
      renderTemplate: { slots: [{ kind: "LITERAL", text: "Always open soon." }] },
    };
    expect(checkSlotProjectionAlignment(def)).toEqual({ ok: true });
  });
});
