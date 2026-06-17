# ADR-140 — Multi-pack composition analysis (`analyzeComposition`)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/analyze` (`analyzeComposition`, `AJD-107..110`), `@adjudicate/cli` (`analyze-composition` subcommand)
- **Related:** ADR-125 (Tier-3 PolicyCoherenceAnalyzer), ADR-109 (Tier-1 analyzers), ADR-105 (closed-vocabulary discipline)

## Context

The only legal way to combine Packs today is to fold a declared *set* into one `PackV0` (the `pack.ts:112-125` signal-registry punt for issue #38). Nothing checked that the hand-authored merge set was free of cross-pack conflicts. The original enhancement report correctly proposed a **Tier-1** analyzer (`AJD-107`); an earlier draft mis-placed it at Tier-3 with a non-existent `AJD-4xx` block.

## Decision

- **`analyzeComposition(packs[], opts?)`** — a pure, offline **Tier-1 (metadata-driven)** analyzer over declarative surfaces only (intents, `taint.minimumFor`, `GuardDescription` metadata, DEFER signals). No planner probes.
- **Gating (sound) checks** in the reserved Tier-1 block:
  - `AJD-107` RewriteOverlap — two packs REWRITE overlapping payload fields (`rewrite.mutatesPayloadFields` ∪ `data_classification` REWRITE `scannedFields`).
  - `AJD-108` DeferSignalCollision — shared `state_defer` signals (relies on the pack-id-prefix convention).
  - `AJD-109` TaintContradiction — a shared intent with differing `minimumFor`.
  - `AJD-110` CapabilityOverlap — the same intent kind declared by ≥2 packs.
- **`passed === false`** (any error-severity conflict) is the CI merge-gate condition; `severityOverrides` can downgrade a check.
- **Probe-dependent reachability** checks are advisory **Tier-3** (`AJD-302/303`), never gating — they would otherwise inherit the probe-coverage soundness hole.
- New CLI `adjudicate analyze-composition --pack … --pack …` (exits non-zero on FAIL).

## Why this shape

- **Tier-1 metadata is sound without probes.** Because the gating checks read only declarative surfaces, the CI gate cannot silently pass on thin probe coverage — the soundness caveat applies only to the optional advisory Tier-3 pass.
- **Offline / CI, never runtime.** Runtime composition analysis would inject N-pack iteration into the hot path and break determinism/replay; it is rejected. A `composition_no_runtime_path` conformance test asserts `@adjudicate/core` does not depend on `@adjudicate/analyze`.

## Invariants preserved

- Pure, deterministic; produces a `CompositionReport` for CI, never an envelope/state/audit record. `AJD-107..110/302/303` are additive `DiagnosticCode`s (analyzer namespace) — distinct from runtime `BASIS_CODES`. `@adjudicate/core` does not import `@adjudicate/analyze` (verified).

## Alternatives considered

- **Runtime detection.** Rejected — VIOLATES determinism, BREAKS replay, tempts a non-additive event.
- **Tier-3 substrate / `AJD-4xx`.** Rejected — the tier reservations define only `1xx/2xx/3xx`; the gating checks are pure-metadata and belong in Tier-1 (`AJD-107..110`), matching the report and ADR-109's reserved next slots.

## Test coverage

`packages/analyze/tests/composition.test.ts` (all four conflicts; clean pass; taint-only subset; severity override flips `passed`; determinism; `composition_no_runtime_path`). `packages/cli/tests/analyze-composition.test.ts` (render PASS/FAIL; requires ≥2 packs).

## Lifecycle

Phase 2: analyzer + CLI. Phase 3: wire `analyze-composition` as a blocking CI gate over an adopter's declared merge set; optional advisory Tier-3 reachability checks with a minimum-probe-coverage floor.
