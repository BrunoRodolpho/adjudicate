/**
 * ClaimDefinition compiler — v1 slice (inv.18): a pure, total, FAIL-CLOSED
 * completeness/consistency VALIDATOR for the generic `ClaimDefinition` shape.
 *
 * It does NOT yet GENERATE kernel artifacts (the DSL/codegen + the `Proof<Claim>`
 * brand are the larger v2, out of scope). What it DOES is take the THREE today-
 * unenforced alignment CONVENTIONS of the claims runtime and make them ONE
 * load-time mechanism that REJECTS an incomplete/inconsistent definition set:
 *
 *   (a) every render-template PROPOSITION slot is backed by a value projection /
 *       binding to a `requiredEvidence` key                       — INV-1, INV-7
 *   (b) every `falsifierComplete: true` type enumerates falsifiers — INV-2
 *       (folds in the existing §R `assertFalsifierDeclaration` hard-throw)
 *   (c) every render-template entry has a registered claim definition — INV-3
 *       (this is what makes a dangling template state IMPOSSIBLE)
 *
 *   …plus every Triad-scoped type appears in some decomposition closure (INV-4),
 *   provenance is default-deny (INV-5), and the §5 structural conjuncts that
 *   already exist as RUNTIME checks (C0 non-vacuity, the cacheable-requires-ttl
 *   shape) are lifted to DEFINITION-LOAD time (INV-6, INV-8).
 *
 * SOURCES CONSOLIDATED (the scattered facets this unifies; see the per-invariant
 * doc comments for exact file:line in the ibatexas + adjudicate trees):
 *   - `requiredEvidence` / `minSourceIntegrity` / `kind` ← `EvidenceRequirement`
 *     (`./evidence-requirement.ts`) + the soundness §5 predicate (`./soundness.ts`).
 *   - falsifier declaration ← `FalsifierDeclaration` + `assertFalsifierDeclaration`
 *     (`./evidence-requirement.ts`).
 *   - value binding ← `ValueBinding` + the C6 binding-key gate (`./soundness.ts`).
 *   - render template / value projections / decomposition closure ← the ibatexas
 *     `slot-grammar.ts` / `claim-registry.ts` / `required-claim-decomposer.ts`
 *     artifacts, modelled here as GENERIC shapes so the validator is testable
 *     IN-REPO without the ibatexas registry or any link.
 *
 * PURITY: every invariant is DEFINITION-LOAD-TIME — no clock, no RNG, no IO — so
 * the whole module is a pure function of its inputs and is exhaustively testable
 * against synthetic fixtures. The validator is TOTAL: it never throws on a
 * malformed input; it returns a `{ ok: false, code, reason }` instead (the
 * underlying `parseEvidenceRequirement` / `assertFalsifierDeclaration` throws are
 * caught and converted). No kernel-downstream import (§R kernel purity).
 */

import {
  type EvidenceRequirement,
  type FalsifierDeclaration,
  type SourceIntegrity,
  assertFalsifierDeclaration,
  parseEvidenceRequirement,
} from "./evidence-requirement.js";
import type { ClaimKind, ValueBinding } from "./soundness.js";

// ─────────────────────────────────────────────────────────────────────────
// The generic render-template + projection shapes (mirror the ibatexas slot
// grammar, kept GENERIC so this validator needs no ibatexas import).
// ─────────────────────────────────────────────────────────────────────────

/**
 * One render-template slot. Mirrors the ibatexas `TemplateSlot` (slot-grammar.ts
 * `LITERAL | PROPOSITION`):
 *
 *   - `LITERAL`     — fixed prose; imposes NO evidence requirement.
 *   - `PROPOSITION` — a value slot filled from a claim of `claimType`, reading its
 *                     `field`. INV-1 requires this slot to be backed by a value
 *                     projection bound to a `requiredEvidence` key.
 */
export type TemplateSlot =
  | { readonly kind: "LITERAL"; readonly text: string }
  | { readonly kind: "PROPOSITION"; readonly claimType: string; readonly field: string };

/** A render template = an ordered list of slots (ibatexas `Template`). */
export interface RenderTemplate {
  readonly slots: readonly TemplateSlot[];
}

/**
 * A value projection: the slot↔ledger binding that backs ONE rendered proposition
 * field with a `requiredEvidence` key (and an optional `path` projection into that
 * evidence value). Mirrors the ibatexas `RegistryClaimSpec.valueBinding {key,
 * path?}` generalized to multiple fields, and is what the adjudicate C6
 * value-binding gate compares at runtime. INV-1 requires every PROPOSITION slot's
 * `field` to have a matching projection; INV-1/INV-7 require `key` to be a member
 * of `requiredEvidence` keys (so presence/freshness/provenance/integrity are
 * already §5-gated before a rendered value can be sourced from it).
 */
export interface ValueProjection {
  readonly field: string;
  readonly key: string;
  readonly path?: readonly (string | number)[];
}

// ─────────────────────────────────────────────────────────────────────────
// The CONSOLIDATED generic ClaimDefinition
// ─────────────────────────────────────────────────────────────────────────

/**
 * The generic, registry-agnostic `ClaimDefinition` — the single shape onto which
 * the today-scattered per-type facets are consolidated. Keyed by `type` (a claim
 * type name). A `Record<string, ClaimDefinition>` plus the cross-tables
 * (render-template keys, decomposition closures, registry enum) is what the
 * validator consumes.
 *
 * Extends `FalsifierDeclaration`, so `falsifierComplete?` / `falsifiers?` are
 * carried verbatim (INV-2 reuses the existing §R guard over them).
 */
export interface ClaimDefinition extends FalsifierDeclaration {
  /** The claim type name (the registry key + the VALIDATED_TEMPLATES key). */
  readonly type: string;
  /** `read_claim | action_claim` — the §5 `c.kind` (drives C4 at runtime). */
  readonly kind: ClaimKind;
  /** The `∀ e ∈ requiredEvidence` set §5 quantifies over (C0 demands non-empty). */
  readonly requiredEvidence: readonly EvidenceRequirement[];
  /** The C2 source-integrity floor each evidence must meet-or-exceed. */
  readonly minSourceIntegrity: SourceIntegrity;
  /** OPTIONAL C6 kernel value-binding; if present its `key` must be §5-gated (INV-7). */
  readonly valueBinding?: ValueBinding;
  /** OPTIONAL slot↔ledger projections backing the render template's slots (INV-1). */
  readonly valueProjections?: readonly ValueProjection[];
  /** OPTIONAL render template; every PROPOSITION slot must be backed (INV-1). */
  readonly renderTemplate?: RenderTemplate;
  /**
   * Whether this type is Triad-scoped. A Triad-scoped type MUST appear in some
   * decomposition closure (INV-4) so the P4 required-set completeness check can
   * never leave it unreachable. Absent ⟹ not Triad-scoped (no closure obligation).
   */
  readonly triadScoped?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation result — FAIL-CLOSED, with a stable code per invariant
// ─────────────────────────────────────────────────────────────────────────

/**
 * The stable failure code identifying WHICH invariant rejected a definition set.
 * Each maps 1:1 to one of the inv.18 invariants so the mutation harness can
 * assert the SPECIFIC reason for each removed/corrupted facet.
 */
export type ValidationFailureCode =
  /** INV-6 — `requiredEvidence` empty (C0 vacuity). */
  | "EMPTY_REQUIRED_EVIDENCE"
  /** INV-8 — an `EvidenceRequirement` / falsifier is structurally ill-formed. */
  | "MALFORMED_EVIDENCE"
  /** INV-5 — an evidence/falsifier has absent/invalid provenancePolicy (default-deny). */
  | "PROVENANCE_DENY"
  /** INV-2 — `falsifierComplete: true` with an empty/missing `falsifiers[]`. */
  | "FALSIFIER_INCOMPLETE"
  /** INV-7 — `valueBinding.key` is not a member of `requiredEvidence` keys. */
  | "BINDING_KEY_UNGATED"
  /** INV-1 — a PROPOSITION slot / projection is not backed by a §5-gated key. */
  | "SLOT_UNBACKED"
  /** INV-3 — a render-template entry has no registered ClaimDefinition. */
  | "TEMPLATE_UNREGISTERED"
  /** INV-4 — a Triad type is absent from every closure, or a closure type is unregistered. */
  | "DECOMPOSITION_UNREACHABLE"
  /** Totality — the value is not a structurally-shaped ClaimDefinition / defs map. */
  | "MALFORMED_DEFINITION";

/**
 * The validator result. `{ ok: true }` on a complete+consistent definition (set);
 * `{ ok: false, code, reason }` otherwise. FAIL-CLOSED: anything not provably
 * complete is REJECTED. The `reason` is a human-legible message; `code` is the
 * stable machine-checkable invariant identity.
 */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ValidationFailureCode; readonly reason: string };

const OK: ValidationResult = { ok: true };

function fail(code: ValidationFailureCode, reason: string): ValidationResult {
  return { ok: false, code, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-requirement validation (INV-5 default-deny + INV-8 structural validity)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate ONE evidence requirement (a `requiredEvidence` member OR a falsifier),
 * fail-closed and TOTAL. Enforces:
 *
 *   - INV-5 (provenance DEFAULT-DENY): an absent/invalid `provenancePolicy` is
 *     treated as DENY (REJECT), not silently `preserve`. Checked FIRST so the
 *     reason is specifically `PROVENANCE_DENY` and not the generic parse error.
 *   - INV-8 (structural validity): the full closed-union shape, incl. the
 *     cacheable-requires-ttl rule, via the existing `parseEvidenceRequirement`
 *     (whose throw is CAUGHT here so this stays total).
 */
function validateRequirement(e: unknown, where: string): ValidationResult {
  if (!isRecord(e)) {
    return fail("MALFORMED_EVIDENCE", `${where}: requirement is not an object.`);
  }
  // INV-5 — provenance default-deny: absent/invalid ⟹ DENY (REJECT). The runtime
  // posture (provenanceVerdict: UNTRUSTED never validates, first_party_only
  // fail-closed on unlabeled) is lifted here to definition-load time.
  const prov = (e as { provenancePolicy?: unknown }).provenancePolicy;
  if (prov !== "preserve" && prov !== "first_party_only") {
    return fail(
      "PROVENANCE_DENY",
      `${where}: requirement key "${String((e as { key?: unknown }).key)}" has ` +
        `absent/invalid provenancePolicy — provenance is default-DENY ` +
        `(must be "preserve" | "first_party_only").`,
    );
  }
  // INV-8 — full structural validity (closed unions + cacheable-requires-ttl).
  // parseEvidenceRequirement THROWS; catch it so the validator stays total.
  try {
    parseEvidenceRequirement(e);
  } catch (err) {
    return fail("MALFORMED_EVIDENCE", `${where}: ${(err as Error).message}`);
  }
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────
// INV-1 — slot → projection → requiredEvidence alignment (a reusable predicate)
// ─────────────────────────────────────────────────────────────────────────

/**
 * INV-1 (the slot↔projection static check, exported as a reusable predicate):
 * every PROPOSITION slot in `def.renderTemplate` MUST be backed by a
 * `valueProjection` (on the slot's `claimType` owner) whose `field` matches the
 * slot's `field` AND whose `key` is a member of that owner's `requiredEvidence`
 * keys. A LITERAL slot imposes nothing; a def with no render template imposes
 * nothing.
 *
 * `lookup` resolves a slot's `claimType` to its owning `ClaimDefinition` for the
 * cross-type composition case. When `lookup` is omitted, only SELF-type slots
 * (`slot.claimType === def.type`) are checked and cross-type slots are deferred
 * (the aggregate `validateClaimDefinitions` always supplies a lookup, so an
 * unresolved cross-type slot is rejected there). TOTAL: guards every field.
 */
export function checkSlotProjectionAlignment(
  def: ClaimDefinition,
  lookup?: (type: string) => ClaimDefinition | undefined,
): ValidationResult {
  const template = (def as { renderTemplate?: unknown }).renderTemplate;
  if (template === undefined) return OK; // no template ⟹ no slot obligations.
  if (!isRecord(template) || !Array.isArray((template as { slots?: unknown }).slots)) {
    return fail("SLOT_UNBACKED", `"${String(def.type)}".renderTemplate.slots must be an array.`);
  }
  const slots = (template as { slots: readonly unknown[] }).slots;
  for (const slot of slots) {
    if (!isRecord(slot) || slot.kind !== "PROPOSITION") continue; // LITERAL ⟹ no backing.
    const claimType = (slot as { claimType?: unknown }).claimType;
    const field = (slot as { field?: unknown }).field;
    if (typeof claimType !== "string" || typeof field !== "string") {
      return fail("SLOT_UNBACKED", `"${String(def.type)}" has a PROPOSITION slot missing claimType/field.`);
    }
    // Resolve the owner definition of the referenced type.
    const owner = claimType === def.type ? def : lookup?.(claimType);
    if (owner === undefined) {
      // Without a lookup we cannot resolve a cross-type slot — defer to the
      // aggregate validator (which always supplies a lookup).
      if (lookup === undefined) continue;
      return fail(
        "SLOT_UNBACKED",
        `PROPOSITION slot prop(${claimType}, "${field}") references a claimType ` +
          `with no registered ClaimDefinition.`,
      );
    }
    const projections = Array.isArray(owner.valueProjections) ? owner.valueProjections : [];
    const projection = projections.find(
      (p) => isRecord(p) && (p as { field?: unknown }).field === field,
    );
    if (projection === undefined) {
      return fail(
        "SLOT_UNBACKED",
        `PROPOSITION slot prop(${claimType}, "${field}") has no value projection ` +
          `backing it (INV-1: every slot must bind to a requiredEvidence key).`,
      );
    }
    const reqKeys = requiredKeySet(owner);
    const pKey = (projection as { key?: unknown }).key;
    if (typeof pKey !== "string" || !reqKeys.has(pKey)) {
      return fail(
        "SLOT_UNBACKED",
        `value projection for prop(${claimType}, "${field}") binds key ` +
          `"${String(pKey)}" which is not a member of requiredEvidence keys.`,
      );
    }
  }
  return OK;
}

function requiredKeySet(def: ClaimDefinition): Set<string> {
  const re = (def as { requiredEvidence?: unknown }).requiredEvidence;
  const arr = Array.isArray(re) ? re : [];
  return new Set(
    arr.map((e) => (isRecord(e) ? String((e as { key?: unknown }).key) : "")),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// validateClaimDefinition — the per-definition invariants (INV-1,2,5,6,7,8)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate ONE `ClaimDefinition`, fail-closed and TOTAL. Enforces the per-def
 * invariants:
 *
 *   - INV-6 — `requiredEvidence` non-empty (C0 non-vacuity).
 *   - INV-8 — every `requiredEvidence` + falsifier is structurally valid.
 *   - INV-5 — every `requiredEvidence` + falsifier has an explicit provenancePolicy
 *             (default-deny).
 *   - INV-2 — `falsifierComplete: true` ⟹ a non-empty, valid `falsifiers[]`.
 *   - INV-7 — `valueBinding.key` ∈ `requiredEvidence` keys (the load-time form of
 *             the runtime C6 guard).
 *   - INV-1 — every render-template PROPOSITION slot is backed by a §5-gated
 *             value projection (cross-type via the optional `lookup`).
 *
 * The cross-table invariants INV-3 (template→registered) and INV-4 (decomposition
 * closure) are SET-level — see `validateClaimDefinitions`.
 *
 * @param lookup resolves a cross-type slot's `claimType` to its owning definition.
 */
export function validateClaimDefinition(
  def: ClaimDefinition,
  lookup?: (type: string) => ClaimDefinition | undefined,
): ValidationResult {
  // ── Totality — structural shape.
  if (!isRecord(def)) return fail("MALFORMED_DEFINITION", "ClaimDefinition is not an object.");
  const type = (def as { type?: unknown }).type;
  if (typeof type !== "string") {
    return fail("MALFORMED_DEFINITION", "ClaimDefinition.type must be a string.");
  }
  const kind = (def as { kind?: unknown }).kind;
  if (kind !== "read_claim" && kind !== "action_claim") {
    return fail("MALFORMED_DEFINITION", `"${type}".kind must be "read_claim" | "action_claim".`);
  }

  // ── INV-6 — C0 non-vacuity (requiredEvidence non-empty).
  const re = (def as { requiredEvidence?: unknown }).requiredEvidence;
  if (!Array.isArray(re)) {
    return fail("MALFORMED_DEFINITION", `"${type}".requiredEvidence must be an array.`);
  }
  if (re.length === 0) {
    return fail(
      "EMPTY_REQUIRED_EVIDENCE",
      `"${type}" has empty requiredEvidence — C0 non-vacuity: a definition with ` +
        `no backing could only ever vacuously assert.`,
    );
  }

  // ── INV-8 + INV-5 — each requiredEvidence is structurally valid + provenance-explicit.
  for (const e of re) {
    const r = validateRequirement(e, `"${type}".requiredEvidence`);
    if (!r.ok) return r;
  }

  // ── INV-5/INV-8 — each falsifier (when present) is structurally valid too.
  const falsifiers = (def as { falsifiers?: unknown }).falsifiers;
  if (falsifiers !== undefined) {
    if (!Array.isArray(falsifiers)) {
      return fail("MALFORMED_DEFINITION", `"${type}".falsifiers must be an array.`);
    }
    for (const f of falsifiers) {
      const r = validateRequirement(f, `"${type}".falsifiers`);
      if (!r.ok) return r;
    }
  }

  // ── INV-2 — falsifier-completeness (the §R lying case). Reuse the existing
  // hard-throw; catch it so the validator stays total.
  try {
    assertFalsifierDeclaration(def);
  } catch (err) {
    return fail("FALSIFIER_INCOMPLETE", (err as Error).message);
  }

  const reqKeys = requiredKeySet(def);

  // ── INV-7 — C6 binding.key gated.
  const vb = (def as { valueBinding?: unknown }).valueBinding;
  if (vb !== undefined) {
    if (!isRecord(vb) || typeof (vb as { key?: unknown }).key !== "string") {
      return fail("MALFORMED_DEFINITION", `"${type}".valueBinding must carry a string key.`);
    }
    const key = (vb as { key: string }).key;
    if (!reqKeys.has(key)) {
      return fail(
        "BINDING_KEY_UNGATED",
        `"${type}" valueBinding.key "${key}" is not a member of requiredEvidence ` +
          `keys — a rendered value could be sourced from an un-§5-gated key.`,
      );
    }
  }

  // ── INV-1 (projections) — every declared projection binds a §5-gated key.
  const projections = (def as { valueProjections?: unknown }).valueProjections;
  if (projections !== undefined) {
    if (!Array.isArray(projections)) {
      return fail("MALFORMED_DEFINITION", `"${type}".valueProjections must be an array.`);
    }
    for (const p of projections) {
      if (
        !isRecord(p) ||
        typeof (p as { field?: unknown }).field !== "string" ||
        typeof (p as { key?: unknown }).key !== "string"
      ) {
        return fail("MALFORMED_DEFINITION", `"${type}" valueProjection must carry string field+key.`);
      }
      const key = (p as { key: string }).key;
      if (!reqKeys.has(key)) {
        return fail(
          "SLOT_UNBACKED",
          `"${type}" valueProjection for field "${(p as { field: string }).field}" ` +
            `binds key "${key}" which is not a member of requiredEvidence keys.`,
        );
      }
    }
  }

  // ── INV-1 (slots) — every PROPOSITION slot is backed by a projection.
  const slotResult = checkSlotProjectionAlignment(def, lookup);
  if (!slotResult.ok) return slotResult;

  return OK;
}

// ─────────────────────────────────────────────────────────────────────────
// validateClaimDefinitions — the SET-level invariants (INV-3, INV-4) + per-def
// ─────────────────────────────────────────────────────────────────────────

/**
 * The cross-tables the set-level invariants quantify over. All OPTIONAL: an
 * absent table skips its invariant (so a caller can validate only the per-def
 * invariants by passing `{}`), but a PRESENT table is enforced fail-closed.
 */
export interface ValidationContext {
  /**
   * The render-template registry keyed by claim type (ibatexas VALIDATED_TEMPLATES).
   * INV-3: every key MUST resolve to a registered ClaimDefinition. The values are
   * not inspected here (slot backing is INV-1 on the def's own `renderTemplate`).
   */
  readonly templates?: Readonly<Record<string, unknown>>;
  /**
   * The decomposition closures keyed by span class (ibatexas REQUIRED_CLAIM_CLOSURE:
   * SpanClass → claim type[]). INV-4: every Triad-scoped def must appear in some
   * value; every referenced type must be registered.
   */
  readonly closures?: Readonly<Record<string, readonly string[]>>;
  /**
   * The set of registered claim types (the CLAIM_REGISTRY enum). Defaults to
   * `Object.keys(defs)` when omitted. INV-3/INV-4 resolve "registered" against this.
   */
  readonly registryEnum?: readonly string[];
}

/**
 * Validate a WHOLE definition set + its cross-tables, fail-closed and TOTAL. Runs
 * `validateClaimDefinition` on each member (with a cross-type lookup) and then the
 * SET-level invariants:
 *
 *   - INV-3 (TEMPLATE → REGISTERED-DEFINITION; mechanizes convention (c)): every
 *     `context.templates` key MUST have a registered ClaimDefinition. This is the
 *     check that makes a dangling template (a render template keyed to a type with
 *     no definition) IMPOSSIBLE at load — it REJECTS rather than booting.
 *   - INV-4 (DECOMPOSITION-CLOSURE membership): every Triad-scoped def type MUST
 *     appear in some `context.closures` value, and every closure-referenced type
 *     MUST be registered.
 *
 * Also enforces def-key↔`def.type` agreement (a mismatch is a malformed map).
 */
export function validateClaimDefinitions(
  defs: Readonly<Record<string, ClaimDefinition>>,
  context: ValidationContext = {},
): ValidationResult {
  if (!isRecord(defs)) return fail("MALFORMED_DEFINITION", "defs must be a record of ClaimDefinitions.");

  const keys = Object.keys(defs);
  const registered = new Set<string>(
    context.registryEnum !== undefined ? context.registryEnum : keys,
  );
  const lookup = (t: string): ClaimDefinition | undefined => defs[t];

  // ── Per-def invariants (INV-1,2,5,6,7,8) + cross-type slot resolution.
  for (const key of keys) {
    const def = defs[key];
    if (def === undefined) {
      return fail("MALFORMED_DEFINITION", `defs key "${key}" maps to an undefined ClaimDefinition.`);
    }
    const r = validateClaimDefinition(def, lookup);
    if (!r.ok) return r;
    if (isRecord(def) && (def as { type?: unknown }).type !== key) {
      return fail(
        "MALFORMED_DEFINITION",
        `defs key "${key}" does not match def.type "${String((def as { type?: unknown }).type)}".`,
      );
    }
  }

  // ── INV-3 — every template entry resolves to a registered definition.
  if (context.templates !== undefined) {
    if (!isRecord(context.templates)) {
      return fail("MALFORMED_DEFINITION", "context.templates must be a record.");
    }
    for (const tkey of Object.keys(context.templates)) {
      if (!registered.has(tkey)) {
        return fail(
          "TEMPLATE_UNREGISTERED",
          `render-template entry "${tkey}" has no registered ClaimDefinition ` +
            `(INV-3: a template with no backing definition is a dangling state).`,
        );
      }
    }
  }

  // ── INV-4 — decomposition closure membership (both directions).
  if (context.closures !== undefined) {
    if (!isRecord(context.closures)) {
      return fail("MALFORMED_DEFINITION", "context.closures must be a record.");
    }
    const closureTypes = new Set<string>();
    for (const span of Object.keys(context.closures)) {
      const members = context.closures[span];
      if (!Array.isArray(members)) {
        return fail("MALFORMED_DEFINITION", `context.closures["${span}"] must be an array.`);
      }
      for (const t of members) {
        if (typeof t !== "string") {
          return fail("MALFORMED_DEFINITION", `context.closures["${span}"] member must be a string.`);
        }
        closureTypes.add(t);
        // reverse direction: a closure-referenced type must be registered.
        if (!registered.has(t)) {
          return fail(
            "DECOMPOSITION_UNREACHABLE",
            `closure "${span}" references type "${t}" which has no registered ` +
              `ClaimDefinition.`,
          );
        }
      }
    }
    // forward direction: every Triad-scoped def must appear in some closure.
    for (const key of keys) {
      const def = defs[key];
      if (isRecord(def) && (def as { triadScoped?: unknown }).triadScoped === true) {
        if (!closureTypes.has((def as { type: string }).type)) {
          return fail(
            "DECOMPOSITION_UNREACHABLE",
            `Triad-scoped type "${(def as { type: string }).type}" appears in no ` +
              `REQUIRED_CLAIM_CLOSURE value — it would be unreachable by the P4 ` +
              `required-set completeness check.`,
          );
        }
      }
    }
  }

  return OK;
}
