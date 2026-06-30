/**
 * @adjudicate/core — claims module barrel (SDD §I, §E, §K).
 *
 * The structural core of the Claims runtime's TYPE surface: the two-level
 * outcome model (`ClaimVerdict` / `TurnTerminal` — §I) and the per-type
 * `EvidenceRequirement` schema the §5 soundness predicate quantifies over (§E).
 * Self-contained within `@adjudicate/core`; no kernel-downstream import (§R).
 */

export * from "./verdict.js";
export * from "./evidence-requirement.js";
export * from "./evidence-ledger.js";
export * from "./soundness.js";
export * from "./consistency.js";
// Q5 — the three kernel interfaces (Read = Access ⊕ Provenance; Action = the
// reused Decision; Claims = P1 ∘ P2) + the asymmetric Read+Action → Ledger →
// Claims → Renderer topology (§F; §R). Composes Q1–Q4 + the existing Action
// kernel; no downstream import (§R).
export * from "./kernels.js";
// W6 — the registry-diff lint (inv.17): classify an ADDITIVE catalog extension vs
// a RELAXATION and fail the build on an undeclared relaxation. No downstream
// import (§R); pure.
export * from "./registry-diff.js";
// inv.18 — the ClaimDefinition compiler (v1 slice): the generic ClaimDefinition
// shape + the pure, total, FAIL-CLOSED completeness/consistency validator that
// makes the three render/falsifier/template alignment conventions ONE load-time
// mechanism. Deliberate minor API widen (consumed by ibatexas). No downstream
// import (§R); pure (definition-load-time only — no clock/RNG/IO).
export * from "./claim-definition.js";
// inv.18 v2 — the ClaimDefinition COMPILER: the small, declarative, schema-driven
// interpreter that GENERATES the runtime artifacts (registry spec, value projector
// data, render template, validator-wiring def, decomposition closure, fixtures, doc)
// FROM a `defineClaim({...})` source. The thesis inversion: the source is the primary
// artifact, the runtime its IMAGE. No downstream import (§R); pure (build-time only).
export * from "./claim-compiler.js";
// inv.17 — the kernel-minted, runtime-non-forgeable renderer-input carrier.
// Export ONLY the opaque TYPE + the `unwrapCanonical` accessor: the brand
// `unique symbol`, the provenance WeakSet, AND the `mintCanonicalClaim`
// constructor are intentionally NOT re-exported (no public constructor — minting
// is reachable only inside `runClaimsKernel`, on a fully-validated claim).
export { type CanonicalClaim, unwrapCanonical } from "./canonical-claim.js";
