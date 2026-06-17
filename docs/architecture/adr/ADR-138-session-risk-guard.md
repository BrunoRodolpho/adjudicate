# ADR-138 — Session risk accumulation & guard

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/primitives` (`SessionRisk`, `foldSessionRiskScore`, `createSessionRiskGuard`), `@adjudicate/adapter-core` (`composeFolds`, `composeMetadataProviders`), `@adjudicate/core` (additive `validation` basis codes)
- **Related:** ADR-124 (hallucination scoring + AuditRecord v5 metadata), ADR-120 (token-budget guard / onTokenUsage seam)

## Context

ADR-124 lets a post-decision scorer attach a `hallucination_score` to the audit metadata, but scoring was observe-only — nothing turned accumulated risk into enforcement. The kernel must never call a scorer (that would inject a non-deterministic, IO-bound, possibly model-graded value into the decision path).

## Decision

- **`SessionRisk`** state fragment `{ window, ewma, count, lastBucket? }` lives in adopter-owned state `S` under the reserved `S.sessionRisk` sub-key.
- **`foldSessionRiskScore(prev, score, opts)`** — pure EWMA fold (α=0.3, window=10), score clamped to `[0,1]`. The **adopter** folds the post-decision score into the next turn's `S` (out of the decision path), exactly mirroring the ADR-120 `onTokenUsage → next-S` seam.
- **`createSessionRiskGuard({ select, thresholds, minCount, … })`** — a pure guard reading ONLY `select(s).sessionRisk` (never a scorer). Tiered: REWRITE / REQUEST_CONFIRMATION / ESCALATE / REFUSE on `validation.GROUNDEDNESS_LOW` / `GROUNDEDNESS_DEGRADED` / `SESSION_RISK_ELEVATED`, with a `minCount` warm-up floor.
- **`composeFolds(...)`** (fold-agnostic combinator) is the sanctioned post-turn wiring point; **`composeMetadataProviders(...)`** merges N providers into the single `metadataProvider` slot (hallucination + PII SHADOW), returning `undefined` when all abstain.

## Why this shape

- **Replay determinism is the crux.** `foldSessionRiskScore` is pure over `(prev, score)`; replay re-applies it in audit order over stored scores, reconstructing byte-identical `SessionRisk` (IEEE-754 doubles are deterministic for the same op sequence; JSON round-trips doubles exactly). The decision-relevant output is which threshold the metric crosses, so near-threshold stability is what the conformance harness pins.
- **Guard reads `S`, not a score.** The scorer stays in `@adjudicate/observability` behind the post-decision `metadataProvider` seam; `primitives` takes no dependency on it.

## Invariants preserved

- `adjudicate()` stays pure over `(envelope, S, policy)` — the score never enters the decision path. Closed Decision union (no new kind). Additive `validation` basis codes; records that never emit them keep byte-identical `auditHash` pre-images.

## Alternatives considered

- **Call the scorer from a guard.** Rejected — injects IO/non-determinism/model-grading into the decision path.
- **Route risk through `MemoryStore`.** Rejected — the single biggest replay hazard (memory is mutable/fail-open, outside replay); `FoldHooks` + the `select(s: S)` signature make the correct path obvious.

## Test coverage

`packages/primitives/tests/session-risk.test.ts` (fold determinism/clamp/window/bucket; guard tiers + warm-up; **central replay-equality harness** — re-fold → byte-identical S → identical decision, with near-threshold fixtures). `packages/adapter-core/tests/fold-hooks.test.ts` (compose order; metadata merge + undefined).

## Lifecycle

Additive. Optional Phase-3 bridge feeds the accumulated trend into `@adjudicate/drift`.
