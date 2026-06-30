/**
 * ClaimDefinition COMPILER — v2 slice (inv.18 v2). The thesis inversion: the
 * `ClaimDefinition` SOURCE is now the PRIMARY artifact and the runtime is its
 * IMAGE. v1 (`./claim-definition.ts`) shipped a fail-closed VALIDATOR; THIS module
 * is the COMPILER that GENERATES the runtime artifacts FROM a source definition.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  THE FOUR DESIGN COMMITMENTS (the owner's pass/fail constraints)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (1) SMALL, PRINCIPLED, DECLARATIVE INTERPRETER. `compileClaimDefinition` is a
 *     set of PURE TOTAL functions, each a uniform FOLD over the schema fields. It
 *     NEVER switches on `def.type`; the only type-specific information is the DATA
 *     inside the def. Adding a claim type = adding a `defineClaim({...})` source —
 *     ZERO interpreter edits. (The whole interpreter is ~one screen of folds; its
 *     size is CONSTANT in the number of claim types.)
 *
 * (2) INVARIANTS ARE DERIVED, not handwritten. v1's INV-1..INV-8 become either
 *     compile-time-illegal-to-express (via the `defineClaim` builder's types) or a
 *     GENERATION RULE the compiler enforces structurally because it KNOWS slots ↔
 *     evidence ↔ projections. The slot→projection→evidence alignment (v1's INV-1 +
 *     INV-7) is the SAME single DERIVED fact here: `toValueProjections` COMPUTES the
 *     projection from `valueBinding` × the render slots, so a slot can never bind a
 *     different key than the §5-gated binding. See `DERIVED_INVARIANTS` below.
 *
 * (3) ILLEGAL STATES UNREPRESENTABLE. The `defineClaim` const-generic builder makes
 *     bad definitions impossible to EXPRESS rather than checked-then-rejected:
 *       · INV-6 `requiredEvidence` is a NON-EMPTY tuple — `[]` is a type error.
 *       · INV-7 `valueBinding.key` is typed `RequiredKeyOf<Self>` (the literal union
 *         of the def's own `requiredEvidence` keys) — binding an un-§5-gated key is
 *         a COMPILE error, not a runtime reject.
 *       · INV-2 falsifier-completeness is a DISCRIMINATED union — `falsifierComplete:
 *         true` with empty `falsifiers` is unrepresentable.
 *       · INV-5 `provenancePolicy` is a REQUIRED field of `EvidenceRequirement`
 *         (default-deny: there is no absent state to default).
 *
 * (4) VERSIONING DESIGNED-IN. Every source carries `version`; the compiler stamps a
 *     disambiguated id (`type@version`) onto every artifact + the generated doc, and
 *     exposes `isFalsifierSetMonotone` so an evidence-schema evolution can be
 *     STRUCTURALLY checked "a newer version is only ever SAFER" (the falsifier set is
 *     append-only across compatible versions). See `VERSIONING` below.
 *
 * (5) GENERATE, DON'T HANDWRITE. `compileClaimDefinition(def)` returns the full
 *     `CompiledArtifacts` bundle (registry spec, value projections, render template,
 *     the validator-wiring `ClaimDefinition`, decomposition closure, property +
 *     mutation FIXTURES, and the doc card). A downstream generator serializes those
 *     to GENERATED files (marked `@generated` + checksum, never hand-edited).
 *
 * HONEST scope note (the one place the design over-stated itself): the design said
 * "`falsifiers[].key` is typed as the requiredEvidence-key union" — that is WRONG and
 * contradicts the worked example, because a falsifier is BY DESIGN a DIFFERENT
 * (cross-) key (STORE_OPEN_NOW's falsifier `schedule:schedule_override` is NOT in
 * requiredEvidence). Only `valueBinding.key` (the C6 / INV-7 gate) is constrained to
 * the required-key union here; falsifier keys are left free (the runtime cross-key
 * arm is what gates them). This is the load-bearing illegal-states lever, applied
 * exactly where it is sound.
 *
 * PURITY: every fold is definition-load/build time — no clock, no RNG, no IO — so the
 * whole module is a pure function of its input. No kernel-downstream import (§R:
 * `adjudicate → claustrum → ibatexas`, never backward).
 */

import type {
  EvidenceRequirement,
  SourceIntegrity,
} from "./evidence-requirement.js";
import type { ClaimKind, ValueBinding } from "./soundness.js";
import type {
  ClaimDefinition,
  RenderTemplate,
  TemplateSlot,
  ValidationFailureCode,
  ValueProjection,
} from "./claim-definition.js";

// ════════════════════════════════════════════════════════════════════════════
//  THE DSL SOURCE SHAPE (what a contributor writes — ONCE)
// ════════════════════════════════════════════════════════════════════════════

/** A NON-EMPTY readonly tuple. Makes `[]` a TYPE error (INV-4/INV-6 unrepresentable). */
export type NonEmpty<T> = readonly [T, ...T[]];

/**
 * A source render slot. The contributor names a FIELD only on a proposition; the
 * backing `claimType` is IMPLIED = the def's own type, and the projection back to the
 * §5-gated evidence key is COMPUTED by the compiler (INV-1 derived) — so a slot can
 * never reference an un-gated key. `lit`/`prop` are the convenience constructors.
 */
export type SourceSlot =
  | { readonly kind: "LITERAL"; readonly text: string }
  | { readonly kind: "PROPOSITION"; readonly field: string };

/** Convenience constructor: a static-text slot. Pure. */
export const lit = (text: string): SourceSlot => ({ kind: "LITERAL", text });

/**
 * Convenience constructor: a PROPOSITION slot naming a FIELD only (claimType is
 * implied = self; the projection to the §5-gated key is derived). Pure.
 */
export const prop = (field: string): SourceSlot => ({ kind: "PROPOSITION", field });

/** The render block — the `validated` (asserting) template, as source slots. */
export interface RenderSource {
  readonly validated: NonEmpty<SourceSlot>;
}

/**
 * The decomposition block — the §O#15 closure contribution: the span class this
 * type answers, the pt-BR markers that classify a request into it (DATA, not code —
 * constraint (1)), and the required-companion set. `requires` is a NON-EMPTY tuple,
 * so a `triadScoped` type that declares a decomposition can never be unreachable
 * (INV-4 derived).
 */
export interface DecompositionSource {
  readonly spanClass: string;
  readonly markers: NonEmpty<RegExp>;
  readonly requires: NonEmpty<string>;
}

/**
 * The DISCRIMINATED falsifier stance (INV-2 unrepresentable). `falsifierComplete:
 * true` STRUCTURALLY REQUIRES a non-empty `falsifiers` tuple; the safe default omits
 * both. There is no way to express "complete with no falsifiers".
 */
export type FalsifierStance =
  | {
      readonly falsifierComplete: true;
      readonly falsifiers: NonEmpty<EvidenceRequirement>;
    }
  | { readonly falsifierComplete?: false; readonly falsifiers?: undefined };

/**
 * The literal union of a definition's OWN `requiredEvidence` keys (INV-7's
 * type-level form). Resolved from the const-inferred `Self` so `valueBinding.key`
 * can be constrained to it — binding an un-§5-gated key becomes a COMPILE error.
 */
export type RequiredKeyOf<Self> = Self extends {
  readonly requiredEvidence: readonly (infer E)[];
}
  ? E extends { readonly key: infer K extends string }
    ? K
    : never
  : never;

/** The non-key, non-stance fields shared by every source definition. */
interface ClaimDefinitionSourceBase {
  /** The claim type name (the registry key + the template key + the closure target). */
  readonly type: string;
  /** Claim-type version (designed-in evolution — stamped onto every artifact). */
  readonly version: number;
  /** `read_claim | action_claim` — the §5 `c.kind` (drives C4 at runtime). */
  readonly kind: ClaimKind;
  /** The C2 source-integrity floor each evidence must meet-or-exceed. */
  readonly minSourceIntegrity: SourceIntegrity;
  /** The `∀ e ∈ requiredEvidence` set — NON-EMPTY tuple (INV-6 unrepresentable). */
  readonly requiredEvidence: NonEmpty<EvidenceRequirement>;
  /** Whether this type is Triad-scoped (a `true` carries a closure obligation, INV-4). */
  readonly triadScoped?: boolean;
  /** Registry partitioning flag (the §D same-subject scope; projected to the spec). */
  readonly customerScoped?: boolean;
  /** OPTIONAL render block; its proposition projections are DERIVED, never authored. */
  readonly render?: RenderSource;
  /** OPTIONAL decomposition closure contribution. */
  readonly decomposition?: DecompositionSource;
}

/**
 * The full DSL source shape — `Self`-parameterized so `valueBinding.key` is typed
 * as the literal union of THIS def's `requiredEvidence` keys (INV-7 at compile time).
 * Authored via {@link defineClaim} (a const-generic builder), NOT a bare annotation:
 * a plain `: ClaimDefinitionSource` annotation cannot infer the per-def key union, so
 * the builder is the load-bearing illegal-states-unrepresentable lever.
 */
export type ClaimDefinitionSource<Self = unknown> = ClaimDefinitionSourceBase &
  FalsifierStance & {
    readonly valueBinding?: {
      readonly key: RequiredKeyOf<Self>;
      readonly path?: readonly (string | number)[];
    };
  };

/**
 * The RUNTIME-facing definition shape the compiler folds consume. Structurally the
 * same as a source, but `valueBinding.key` is a plain `string` — the §5-gating
 * (INV-7 key-union) is enforced at AUTHORING time by {@link defineClaim}'s
 * F-bounded `RequiredKeyOf`, so once a value has been authored it flows here as an
 * ordinary structural record. (Using `ClaimDefinitionSource` directly here would
 * default `Self = unknown`, collapsing `RequiredKeyOf<unknown>` to `never` and
 * rejecting EVERY def that declares a `valueBinding` — the param must be loosened.)
 * A `defineClaim(...)` result is assignable to this (literal key ⊂ string).
 */
export type CompilableClaimDefinition = ClaimDefinitionSourceBase &
  FalsifierStance & {
    readonly valueBinding?: {
      readonly key: string;
      readonly path?: readonly (string | number)[];
    };
  };

/**
 * The DSL ENTRYPOINT — a const-generic builder. The F-bounded `T extends
 * ClaimDefinitionSource<T>` constraint feeds the inferred literal `T` back into the
 * source type so `valueBinding.key` must be a member of `T`'s own `requiredEvidence`
 * keys (INV-7), `requiredEvidence`/`falsifiers` must be non-empty (INV-4/INV-6),
 * and the falsifier stance must be consistent (INV-2) — ALL at COMPILE time. The
 * builder is the identity at runtime; it exists purely to mint those per-def types.
 */
export function defineClaim<const T extends ClaimDefinitionSource<T>>(source: T): T {
  return source;
}

// ════════════════════════════════════════════════════════════════════════════
//  THE COMPILED ARTIFACTS (the runtime IMAGE the compiler GENERATES)
// ════════════════════════════════════════════════════════════════════════════

/**
 * The registry spec the compiler projects from a source. STRUCTURALLY identical to
 * the ibatexas `RegistryClaimSpec` (kept generic here so the compiler needs no
 * downstream import); the generated ibatexas file assigns it to `RegistryClaimSpec`.
 */
export interface CompiledRegistrySpec {
  readonly kind: ClaimKind;
  readonly minSourceIntegrity: SourceIntegrity;
  readonly requiredEvidence: readonly EvidenceRequirement[];
  readonly customerScoped: boolean;
  readonly falsifierComplete?: boolean;
  readonly falsifiers?: readonly EvidenceRequirement[];
  readonly valueBinding?: ValueBinding;
}

/** The decomposition closure contribution the compiler projects from a source. */
export interface CompiledClosure {
  readonly spanClass: string;
  readonly requires: readonly string[];
  readonly markers: readonly RegExp[];
}

/**
 * One MUTATION fixture: a structurally-corrupted `ClaimDefinition` paired with the
 * `ValidationFailureCode` the v1 validator MUST reject it with. The compiler
 * GENERATES one per applicable invariant (mirroring the v1 mutation-harness intent)
 * so the slice ships a proof that each invariant code fires — without hand-writing
 * the mutations.
 */
export interface MutationFixture {
  readonly code: ValidationFailureCode;
  readonly def: ClaimDefinition;
}

/** The property + mutation fixtures the compiler generates for a type. */
export interface CompiledFixtures {
  /** A definition that MUST validate (the compiled, complete definition). */
  readonly valid: ClaimDefinition;
  /** One corrupted definition per applicable invariant (MUST reject with `code`). */
  readonly mutations: readonly MutationFixture[];
}

/** Everything the compiler GENERATES from ONE source definition. */
export interface CompiledArtifacts {
  readonly type: string;
  readonly version: number;
  /** `type@version` — stamped onto generated artifacts + the doc (versioning). */
  readonly id: string;
  /** (1) the registry spec row. */
  readonly registrySpec: CompiledRegistrySpec;
  /** (2) value-projector DATA (the projector itself is the generic `projectValue`). */
  readonly valueProjections: readonly ValueProjection[];
  /** (3) renderer binding / template wiring (claimType filled = self on every prop). */
  readonly renderTemplate: RenderTemplate | undefined;
  /** (4) validator wiring — the generic v1 `ClaimDefinition`. */
  readonly definition: ClaimDefinition;
  /** (7) decomposition rows (closure + span markers). */
  readonly closure: CompiledClosure | undefined;
  /** (5) property + mutation fixtures. */
  readonly fixtures: CompiledFixtures;
  /** (6) the generated markdown doc card. */
  readonly doc: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  THE FOLDS — each a PURE function of the schema, NO switch on def.type
// ════════════════════════════════════════════════════════════════════════════

/**
 * (3) renderer binding / template wiring. Maps the source `render.validated` slots to
 * core `TemplateSlot`s, filling `claimType = def.type` for every proposition (the
 * "claimType implied = self" derivation). No render block ⟹ no template.
 */
function toRenderTemplate(def: CompilableClaimDefinition): RenderTemplate | undefined {
  if (def.render === undefined) return undefined;
  const slots: TemplateSlot[] = def.render.validated.map((slot) =>
    slot.kind === "LITERAL"
      ? { kind: "LITERAL", text: slot.text }
      : { kind: "PROPOSITION", claimType: def.type, field: slot.field },
  );
  return { slots };
}

/**
 * (2) value-projector DATA — the DERIVED slot↔ledger wiring (INV-1 + INV-7 as ONE
 * fact). For every PROPOSITION slot, bind its `field` to the def's `valueBinding`
 * key+path. The contributor writes the field ONCE (in `render`) and the key ONCE (in
 * `valueBinding`); the projection is COMPUTED, so the alignment is true BY
 * CONSTRUCTION — there is no second place to keep in sync. No render or no binding ⟹
 * no projections.
 */
function toValueProjections(def: CompilableClaimDefinition): ValueProjection[] {
  if (def.render === undefined || def.valueBinding === undefined) return [];
  const binding = def.valueBinding;
  return def.render.validated
    .filter(
      (slot): slot is Extract<SourceSlot, { kind: "PROPOSITION" }> =>
        slot.kind === "PROPOSITION",
    )
    .map((slot) => ({
      field: slot.field,
      key: binding.key,
      ...(binding.path === undefined ? {} : { path: binding.path }),
    }));
}

/** (1) registry spec — a uniform projection of the §5/registry-relevant fields. */
function toRegistrySpec(def: CompilableClaimDefinition): CompiledRegistrySpec {
  return {
    kind: def.kind,
    minSourceIntegrity: def.minSourceIntegrity,
    requiredEvidence: def.requiredEvidence,
    customerScoped: def.customerScoped ?? false,
    ...(def.falsifierComplete === true
      ? { falsifierComplete: true, falsifiers: def.falsifiers }
      : {}),
    ...(def.valueBinding === undefined ? {} : { valueBinding: def.valueBinding }),
  };
}

/** (7) decomposition rows — a direct projection of the source closure block. */
function toClosure(def: CompilableClaimDefinition): CompiledClosure | undefined {
  if (def.decomposition === undefined) return undefined;
  return {
    spanClass: def.decomposition.spanClass,
    requires: def.decomposition.requires,
    markers: def.decomposition.markers,
  };
}

/**
 * (4) validator wiring — the generic v1 `ClaimDefinition`. Assembles the SAME shape
 * v1's `buildClaimDefinition` produced, but INVERTED (source → definition) and with
 * the projections DERIVED here, so the load-time `validateClaimDefinitions` still
 * runs as defense-in-depth for wire/JSON-sourced defs + cross-type set resolution.
 */
function toDefinition(def: CompilableClaimDefinition): ClaimDefinition {
  const renderTemplate = toRenderTemplate(def);
  const valueProjections = toValueProjections(def);
  return {
    type: def.type,
    kind: def.kind,
    requiredEvidence: def.requiredEvidence,
    minSourceIntegrity: def.minSourceIntegrity,
    triadScoped: def.triadScoped ?? false,
    ...(def.valueBinding === undefined ? {} : { valueBinding: def.valueBinding }),
    ...(valueProjections.length === 0 ? {} : { valueProjections }),
    ...(renderTemplate === undefined ? {} : { renderTemplate }),
    ...(def.falsifierComplete === true
      ? { falsifierComplete: true, falsifiers: def.falsifiers }
      : {}),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  FIXTURE GENERATION — one corrupted def per applicable invariant (data, not code)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate the property + mutation fixtures for a definition. The `valid` fixture is
 * the compiled definition itself (it MUST validate). Each mutation is a structural
 * corruption that MUST be rejected with the paired `ValidationFailureCode` — mirror-
 * ing the v1 mutation-harness intent, but GENERATED from the def, not hand-written.
 * Only invariants the def can actually exercise produce a fixture (e.g. no
 * `valueBinding` ⟹ no BINDING_KEY_UNGATED mutation).
 */
function toFixtures(valid: ClaimDefinition): CompiledFixtures {
  const mutations: MutationFixture[] = [];

  // INV-6 — empty requiredEvidence (always applicable).
  mutations.push({
    code: "EMPTY_REQUIRED_EVIDENCE",
    def: { ...valid, requiredEvidence: [] },
  });

  // INV-5 — strip provenancePolicy off the first evidence (default-deny).
  const [head, ...rest] = valid.requiredEvidence;
  if (head !== undefined) {
    const { provenancePolicy: _dropped, ...withoutProvenance } = head;
    mutations.push({
      code: "PROVENANCE_DENY",
      def: {
        ...valid,
        requiredEvidence: [withoutProvenance as EvidenceRequirement, ...rest],
      },
    });
  }

  // INV-7 — bind an un-§5-gated key (only if the def declares a valueBinding).
  if (valid.valueBinding !== undefined) {
    mutations.push({
      code: "BINDING_KEY_UNGATED",
      def: { ...valid, valueBinding: { ...valid.valueBinding, key: "__ungated__" } },
    });
  }

  // INV-2 — claim falsifier-completeness while enumerating none (only if complete).
  if (valid.falsifierComplete === true) {
    mutations.push({
      code: "FALSIFIER_INCOMPLETE",
      def: { ...valid, falsifierComplete: true, falsifiers: [] },
    });
  }

  // INV-1 — drop the derived projections so the render proposition is unbacked
  // (only if the def has a render template with a proposition projection).
  if (
    valid.renderTemplate !== undefined &&
    (valid.valueProjections?.length ?? 0) > 0
  ) {
    const { valueProjections: _drop, ...withoutProjections } = valid;
    mutations.push({ code: "SLOT_UNBACKED", def: withoutProjections });
  }

  return { valid, mutations };
}

// ════════════════════════════════════════════════════════════════════════════
//  THE DOC CARD — generated markdown (constraint (5): emit the doc)
// ════════════════════════════════════════════════════════════════════════════

function toDoc(def: CompilableClaimDefinition, id: string): string {
  const ev = def.requiredEvidence.map((e) => `\`${e.key}\``).join(", ");
  const fals =
    def.falsifierComplete === true
      ? def.falsifiers.map((f) => `\`${f.key}\``).join(", ")
      : "_(none — UNKNOWN-only until falsifiers are enumerated)_";
  const binding =
    def.valueBinding === undefined
      ? "_(value-agnostic)_"
      : `\`${def.valueBinding.key}\`${
          def.valueBinding.path === undefined
            ? ""
            : ` path \`${def.valueBinding.path.join(".")}\``
        }`;
  const slots =
    def.render === undefined
      ? "_(no render template)_"
      : def.render.validated
          .map((s) => (s.kind === "LITERAL" ? `\`${s.text}\`` : `**{${s.field}}**`))
          .join(" + ");
  const closure =
    def.decomposition === undefined
      ? "_(no decomposition)_"
      : `span \`${def.decomposition.spanClass}\` → requires ${def.decomposition.requires
          .map((t) => `\`${t}\``)
          .join(", ")}`;
  return [
    `# Claim type: ${id}`,
    "",
    "> GENERATED from the ClaimDefinition source by `claimdef-compiler`. Do not hand-edit.",
    "",
    `- **kind**: \`${def.kind}\``,
    `- **min source integrity**: \`${def.minSourceIntegrity}\``,
    `- **triad-scoped**: ${def.triadScoped === true ? "yes" : "no"}`,
    `- **required evidence**: ${ev}`,
    `- **falsifiers**: ${fals}`,
    `- **value binding (C6)**: ${binding}`,
    `- **render (validated)**: ${slots}`,
    `- **decomposition**: ${closure}`,
    "",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
//  THE COMPILER — the single entrypoint (a fold over the folds)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compile ONE `ClaimDefinitionSource` into its full runtime IMAGE. PURE + TOTAL; it
 * NEVER switches on `def.type`; adding a claim type adds a source file and ZERO
 * interpreter code. The returned bundle is what a downstream generator serializes to
 * GENERATED files (registry spec, projector data, template, validator-wiring def,
 * closure, fixtures, doc), each marked `@generated`.
 */
export function compileClaimDefinition(def: CompilableClaimDefinition): CompiledArtifacts {
  const id = `${def.type}@${def.version}`;
  const definition = toDefinition(def);
  return {
    type: def.type,
    version: def.version,
    id,
    registrySpec: toRegistrySpec(def),
    valueProjections: toValueProjections(def),
    renderTemplate: toRenderTemplate(def),
    definition,
    closure: toClosure(def),
    fixtures: toFixtures(definition),
    doc: toDoc(def, id),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  VERSIONING — the designed-in evolution guard (monotone-safety, DERIVED)
// ════════════════════════════════════════════════════════════════════════════

/**
 * STRUCTURAL evolution guard (designed-in versioning): a newer version of a type is
 * "only ever SAFER" IFF its falsifier set is a SUPERSET of the old one (the falsifier
 * set is APPEND-ONLY across compatible versions — adding a falsifier is demote-only,
 * it can only turn VALIDATED into UNKNOWN, the monotone-safety property the kernel
 * already guarantees at runtime). Removing a falsifier / loosening the floor is a
 * BREAKING major bump and returns `false` here. Pure; compares the compiled specs.
 *
 * This makes "a newer version is only ever safer" a DERIVED guard a CI step can run,
 * not a hand-review — exactly the constraint-(4) versioning stance, mechanized.
 */
export function isFalsifierSetMonotone(
  older: CompiledRegistrySpec,
  newer: CompiledRegistrySpec,
): boolean {
  const oldKeys = new Set((older.falsifiers ?? []).map((f) => f.key));
  const newKeys = new Set((newer.falsifiers ?? []).map((f) => f.key));
  for (const k of oldKeys) {
    if (!newKeys.has(k)) return false; // a removed falsifier is a breaking relaxation.
  }
  return true;
}
