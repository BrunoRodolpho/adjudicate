# ADR-129 — PII Events drill-down read seam

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** `@adjudicate/admin-sdk` (`governance.piiEvents` + `PiiEvents*` schemas + `createPiiEventsHandler`), apps/console (PII Events page), apps/web (public PII transparency view).
- **Related:** ADR-117 (data-classification guard — produces the basis codes), ADR-128 (web-parity platform / dual-app contract).

## Context

ADR-117 already exposes aggregate PII dispositions via `governance.piiClassificationStats` (counts bucketed by sensitivity × disposition), rendered as a compact dashboard sub-panel. Phase-3 requires a first-class **PII Events** surface with an event-level drill-down (which records were redacted/blocked, when, of what sensitivity) plus a public transparency view — without ever exposing the redacted values themselves.

## Decision

- **`governance.piiEvents`** (new tRPC query) + `createPiiEventsHandler` over the existing `AuditStore`. Returns one event per `(record × pii basis code)` occurrence — `{ intentHash, at, intentKind, decisionKind, sensitivityLevel, disposition }` — newest-first, with optional `sensitivityLevel`/`disposition` filters and a `limit` (default 200, hard max 500) + a `truncated` flag. **Requires an authenticated actor** (record-level governance data, consistent with `audit.query`).
- **Console:** a dedicated `/pii` page — sensitivity-class breakdown (`BarDistribution`), redacted-vs-blocked summary, and an event table (`DataTable`) whose rows link to the Decision Detail, all wrapped in the Phase-A `AsyncBoundary`.
- **Web:** a public, aggregates-only `/transparency/pii` view fed by a committed *illustrative* fixture projected through the cohort-floor contract (`public-projection`), labeled as sample data.

## Why this shape

- **No new store, no kernel change.** Events are projected from `decision_basis` the kernel already records; the handler is a pure read over the same `AuditStore` as the aggregate.
- **Redaction by construction.** The event row schema has no field for the redacted value or path — those never enter an `AuditRecord` and cannot be reconstructed. The public web view additionally floors small cohorts (`<5`) so low-volume deployments can't be de-anonymized.
- **Auth tier matches data granularity.** The aggregate (counts only) stays unauthenticated-friendly; the event drill-down (intent hashes/kinds) requires an actor.

## Invariants preserved

- Determinism/replay untouched — read-only telemetry outside the determinism boundary; no clock/RNG except the handler's injected `clock` for the window upper bound. No closed-enum widening (reuses `SensitivityLevel`/`PiiDisposition`/`DecisionKind`). Additive MINOR on `@adjudicate/admin-sdk`.

## Test coverage

`packages/admin-sdk/tests/pii-events-handler.test.ts` (newest-first ordering, field allowlist / no value leak, sensitivity+disposition filters, limit/truncated, window + non-PII exclusion). Console PII page component test (states, row links, filters, truncated note). Web `pii-transparency` projection test (cohort floor, no raw-key leak).

## Lifecycle

New `@adjudicate/admin-sdk` symbols (`governance.piiEvents`, `PiiEventsQuerySchema`/`PiiEventSchema`/`PiiEventsResultSchema` + inferred types, `createPiiEventsHandler`) ship in the combined WS3 MINOR wave with `.changeset/pii-events.md` and V1_FREEZE_MATRIX rows (added in the Phase-E backfill). Console/web are app-only.
