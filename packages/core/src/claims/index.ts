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
