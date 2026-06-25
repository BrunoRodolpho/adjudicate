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
