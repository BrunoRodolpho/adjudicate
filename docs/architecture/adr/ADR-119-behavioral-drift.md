# ADR-119 — `@adjudicate/drift`: behavioral/statistical drift detection

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** new `@adjudicate/drift` package, `@adjudicate/admin-sdk` (`governance.behavioralDrift`), `apps/console` (Behavioral Drift panel)
- **Related:** ADR-114/v0.7 (AuditEventBus), `@adjudicate/observability` ecosystem-telemetry (bounded-cardinality model)

## Context

Operators need to spot when an agent's *decision distribution* shifts — a sudden REFUSE spike, a never-seen intent kind — beyond the per-record integrity checks the existing operational `DriftPanel` surfaces. This is an analytics layer over the audit substrate, not a decision-path concern.

## Decision

Ship `@adjudicate/drift`: `createDriftDetector({ baselineWindow, recentWindow?, alertThreshold, dimensions, maxCategoriesPerDimension?, onDrift? })` returning `{ observe, evaluate, snapshot, attach, reset }`. It subscribes to the `AuditEventBus` (`attach(bus)`), maintains bounded running distributions per dimension (`decision.kind` / `intent.kind` / `basis`) over a **frozen baseline** vs a **trailing recent** window, and raises three signals: `distribution_shift` (total-variation distance ≥ threshold), `new_category`, `proportion_spike`. Surfaced via `governance.behavioralDrift` + a console `BehavioralDriftPanel`.

## Why this shape

- **Pure observer, split read.** `observe(record)` is synchronous/total/no-throw (the bus-handler contract — it tolerates malformed records by contributing no keys). `evaluate()` is the only method that fires `onDrift`, keeping the counter update free of callback side effects.
- **TVD, count-based windows.** Total-variation distance is bounded [0,1], deterministic, and defined on disjoint key sets (KL-divergence is not). Windows advance by observation count, not wall-clock, so the detector is a pure function of the observation sequence — no clock on the read path.
- **Bounded cardinality.** Per-dimension cap (default 64) with an `__overflow__` bucket, modeled on `ecosystem-telemetry`.
- **Distinct package, distinct panel.** The operational `DriftPanel` counts integrity-violation refusal codes; this is statistical distribution shift. New `BehavioralDriftPanel` on the governance page; the existing panel is untouched.

## Invariants preserved

- The kernel never imports `@adjudicate/drift` (a dependency-direction test asserts core has no such dep); nothing here reaches `intentHash` or `adjudicate()`. The bus is lossy/best-effort and, by its own contract, never feeds adjudication.
- Determinism: a fast-check property asserts two detectors fed the same record sequence produce byte-identical `snapshot()` and `evaluate()` output.

## Alternatives considered

- **Extend `createEcosystemTelemetry`.** Rejected — it is a privacy-preserving aggregate-and-share snapshot with no baseline/recent comparison or alerting; drift needs a window + `onDrift`. A new package keeps both responsibilities clean.
- **KL-divergence / wall-clock windows.** Rejected — undefined on new keys / non-deterministic, respectively.

## Test coverage

`packages/drift/tests/`: TVD unit, detector (baseline freeze, FIFO eviction, REFUSE-spike + new-intent alerts, basis dimension, attach/reset), bounded-cardinality, determinism property (fast-check), observer-purity + dependency-direction, golden fixture. `apps/console`: BehavioralDriftPanel component test.

## Lifecycle

`DriftDimension` / `DriftSignalKind` are closed taxonomies (additions MINOR); `DriftSnapshot.schemaVersion` is pinned for dashboards. The console warms the detector from mock records at startup (no live bus); production wires `attach(auditEventBus)`.
