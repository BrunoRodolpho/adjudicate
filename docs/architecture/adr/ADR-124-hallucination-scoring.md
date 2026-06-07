# ADR-124 — Hallucination scoring + AuditRecord v5 metadata

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/core` (AuditRecord v5 `metadata` + `metadataProvider` seam + `attachAuditMetadata`), `@adjudicate/observability` (hallucination scorer + semconv), `@adjudicate/admin-sdk` (schema), `@adjudicate/audit-postgres` (v5 row mapping), apps/console (HallucinationBadge)
- **Related:** ADR-111 (AuditRecord v4 / auditHash), ADR-112 (observability)

## Context

Adopters want to score LLM outputs for groundedness and attach a `hallucination_score` to the audit trail, then let high scores raise session risk so subsequent intents face stricter guards. Scoring is intrinsically **post-decision and asynchronous** (it judges generated text against retrieved context).

## Decision

- **AuditRecord v5** adds an optional `metadata?: Record<string, unknown>` field, **excluded from the `auditHash` pre-image** (exactly like `signature`) in BOTH `buildAuditRecord` and `verifyAuditRecord`. Plus a pure `attachAuditMetadata(record, metadata)` for the async re-emit case.
- **`adjudicateAndAudit({ metadataProvider })`** — an optional synchronous hook that runs after `buildAuditRecord` and before `sink.emit`, on the main AND kill-switch paths, defensively (a throwing provider is swallowed via `recordSinkFailure`).
- **`@adjudicate/observability`** — `createHallucinationMetadataProvider({ scorer, exporter? })` returns `{ hallucination_score, hallucination_bucket }` and emits the `adjudicate.hallucination.score` / `.bucket` semconv attributes; `bucketHallucinationScore` for deterministic bucketing.
- **Session risk** is the adopter folding the score into state `S` — the kernel never reads the score.
- **console** `HallucinationBadge` on the decision-detail page (reads `metadata`, no new endpoint).

## Why this shape

- **Metadata excluded from `auditHash` is the crux.** Scoring happens after emission; if `metadata` were hashed, attaching it would flip every record to `tampered`. Excluding it in both build + verify keeps tamper-evidence intact for the hashed fields while allowing post-hoc attachment.
- **Provider, not LearningEvent.** `LearningSink.recordOutcome` is fire-and-forget with no path back to mutate the record. The `metadataProvider` seam runs at the one place that builds + emits the record.
- **Score is metadata/telemetry, never a decision input.** `adjudicate()` has no score, no metadata, no scorer. Determinism: a test pins identical Decision + `intentHash` + `auditHash` with vs without a provider.

## Invariants preserved

- `intentHash` unaffected (metadata lives on the AuditRecord, not the envelope). The v4→v5 bump changes the `version` field (which IS hashed), so audit hashes differ from v4 — but the structural auditHash tests (determinism, tamper detection) hold; v1–v4 records still verify. Golden envelope vectors are version-independent.
- A throwing provider never blocks emission (record still emitted, sans metadata).

## Alternatives considered

- **Put the score in `LearningEvent`.** Rejected — no return path + couples the kernel to a domain concept.
- **Include metadata in `auditHash` + require synchronous scoring.** Rejected — forces blocking LLM-judge on the decision path and breaks async scoring.
- **Side table keyed by intentHash (no wire bump).** Rejected — the score is governance-relevant and belongs on the durable record; loses the single-record forensic view.

## Test coverage

`packages/core/tests/audit-record-v5.test.ts` (metadata carried; **auditHash identical with/without metadata**; metadata mutation not flagged; hashed-field tamper still detected; attachAuditMetadata; v4-shaped still verifies). `packages/core/tests/kernel/metadata-provider.test.ts` (both paths, throwing-provider, decision/hash invariance, undefined). `packages/observability/tests/hallucination.test.ts` (bucketing + provider + clamp + best-effort exporter). apps/console HallucinationBadge test.

## Lifecycle

Wire-version bump v4→v5; readers branch on `version` for `metadata`.

**Durable persistence (migration 010).** The v4→v5 bump stamps `record_version=5`
on every record unconditionally. `audit-postgres` migration
`010-add-v5-metadata.sql` widens the `record_version` CHECK to `IN (1,2,3,4,5)`
(without it, every live insert fails Postgres 23514 against a DB migrated through
009 — the same class of regression migration 008 fixed for v4) **and** adds the
nullable `metadata_jsonb` column. `recordToRow`/`rowToRecord` now persist and
recover `metadata` losslessly; `postgres-sink.test.ts` pins the CHECK ceiling
against the sink-stamped version, and `integration.test.ts` exercises a live v5 +
metadata round-trip.

**Cross-version verification.** `verifyAuditRecord` strips `metadata` from the
pre-image; a **pre-v5** verifier does not, so it would re-derive a different hash
and FALSELY flag a metadata-bearing record as `tampered`. Contract: a v5 record
carrying metadata MUST be verified by core ≥ v5. Metadata-free records are
cross-version safe. Pinned by the cross-version test in `audit-record-v5.test.ts`.
