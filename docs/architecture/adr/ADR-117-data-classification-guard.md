# ADR-117 — PII / data-classification guard + `data_classification` GuardDescription

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/primitives` (`createDataClassificationGuard`), `@adjudicate/core` (`GuardDescription` widening + `validation` basis codes), `@adjudicate/analyze` (AJD-104 parity), `@adjudicate/admin-sdk` (`governance.piiClassificationStats`), `apps/console` + `apps/web` (surfaces)
- **Related:** ADR-105 (guard metadata), ADR-104 (REWRITE scope), ADR-108 (primitives expansion), ADR-109 (analyzers)

## Context

Adopters governing LLM agents need to detect and contain sensitive data (PII/PHI: SSNs, account/card numbers, medical identifiers) that an UNTRUSTED, model-proposed `IntentEnvelope.payload` may carry. The kernel already owns the right disposition mechanics — `REWRITE` for field-level sanitization, `REFUSE` to block — but there was no L2 factory encoding the "classify-then-dispose" pattern, and no structured way for analyzers/console to see that a guard performs data classification.

The original roadmap assumed the guard could (a) tie into a four-level taint lattice including an "LLM" tier and (b) surface its sensitivity tier through `GuardDescription` metadata to the operator console. Both are wrong against the real architecture: the taint lattice is the three-level `SYSTEM > TRUSTED > UNTRUSTED`, and `GuardDescription` is **never serialized into an `AuditRecord`** (it is read by static analyzers off the in-memory guard function, not persisted).

## Decision

1. **`createDataClassificationGuard({ matches, patterns, scannedFields, action, sensitivityLevel, reason?, userFacing? })`** in `@adjudicate/primitives`. A pure `Guard<K,P,S>` that scans a whitelist of payload fields (dotted paths) for the supplied regex patterns and, on detection, either:
   - **REWRITE** — masks the matched substrings in the matched fields (per-pattern `redact?` or a `[REDACTED]` default), rebuilds the envelope via `buildEnvelope` **preserving `taint`/`nonce`/`actor`/`createdAt`**, and emits a `validation.pii_redacted` basis; or
   - **REFUSE** — a `SECURITY` refusal with a `validation.pii_blocked` basis.

2. **`GuardDescription` gains an additive `data_classification` variant** (`{ kind, sensitivityLevel, action, scannedFields }`) in `@adjudicate/core/kernel/policy.ts`. This is a closed-enum widening, permitted per ADR-105 rules 1–3 (additive, discriminated, existing variants immutable; tooling tolerates unknown variants).

3. **Three additive `validation` basis codes** in `@adjudicate/core/basis-codes.ts`: `PII_DETECTED`, `PII_REDACTED`, `PII_BLOCKED`.

4. **Dual channel for the runtime sensitivity tier (the load-bearing detail):** because `GuardDescription` does not reach the audit record, `sensitivityLevel` and the runtime `redactedFields`/`detectedPatterns` travel in **`DecisionBasis.detail`** (which *is* persisted on `AuditRecord.decision_basis`). The static `GuardDescription` carries `sensitivityLevel` + the *permitted* `scannedFields` for analyzers; `basis.detail` carries the *actual* tier + fired fields for the console. Both, redundantly, by design.

5. **AJD-104 parity** in `@adjudicate/analyze`: a `data_classification` guard with `action: "REWRITE"` and empty `scannedFields` is flagged (same REWRITE-scope discipline as the `rewrite` variant). The factory also throws at construction on empty `scannedFields`.

6. **Surfaces.** `governance.piiClassificationStats` (admin-sdk) aggregates audit records by `(sensitivityLevel × disposition)`; `apps/console` renders a `PiiClassificationPanel` on the dashboard; `apps/web` ships a "Data Classification · PII" Decision-Lab preset whose inline demo Pack REWRITE-redacts a fake SSN.

## Why this shape

- **Pure, stateless guard.** Patterns are captured at Pack-definition time (config, not mutable state). Detection is pure regex evaluation over the payload — no clock, I/O, or RNG. This keeps it inside the deterministic decision path with no replay hazard.
- **`basis.detail`, not metadata, for runtime telemetry.** The only structured channel that survives into the durable `AuditRecord` is `decision_basis[].detail`. Putting sensitivity there is what makes the console aggregation possible; mirroring it in `GuardDescription` keeps static analyzers first-class.
- **REWRITE preserves taint verbatim.** Redaction removes content but does not *declassify* — raising taint would trip the `rewrite_taint_regression` integrity-drift signal, and true declassification needs field-level taint (`TaintedValue`, deferred). Lowering taint is never correct here either; identical taint is the only sound choice.

## Invariants preserved

- **Kernel determinism.** The guard is a pure `(envelope, state) => Decision | null`. A replay property test (1000 runs over taint × payload × action) asserts byte-identical decisions and `rewritten.intentHash`.
- **`intentHash` unchanged in shape.** REWRITE recomputes the hash over the (redacted) payload via `buildEnvelope`; `sensitivityLevel`/`redactedFields` live only in `basis.detail`, which is not part of the hash pre-image.
- **Taint lattice.** Never raised (`taintRank(rewritten) ≤ taintRank(envelope)`, in fact equal); a property test enforces it across all three levels.
- **Closed enums.** The `GuardDescription` widening is additive; existing variants are untouched; `validation` basis codes are additive on the `as const` map.

## Alternatives considered

- **Carry `sensitivityLevel` only in `GuardDescription`.** Rejected — it never reaches the audit record, so the console would show nothing.
- **Declassify taint on full redaction (UNTRUSTED → TRUSTED).** Rejected for v1 — trips `rewrite_taint_regression` semantics and requires field-level taint to be sound; recorded as the explicit follow-up.
- **LLM-as-judge PII detection.** Rejected — non-deterministic, cannot live in the pure decision path.

## Test coverage

- `packages/primitives/tests/data-classification.test.ts` — unit (engagement, REWRITE field-masking + envelope-identity, custom/default redact, nested dotted-path, multi-pattern ordering, REFUSE shape, metadata, empty-`scannedFields` throw).
- `packages/primitives/tests/data-classification.property.test.ts` — replay determinism + taint non-regression (fast-check).
- `packages/primitives/tests/data-classification.adversarial.test.ts` — non-object payloads, out-of-scope fields, dotted-key collision, ReDoS-bounded input, taint preservation across levels.
- `packages/analyze/tests/analyze.test.ts` — AJD-104 data_classification scope.
- `packages/core/tests/basis-codes.test.ts` — PII validation codes.
- `packages/admin-sdk/tests/pii-classification-handler.test.ts` — bucketing handler.
- `apps/console/src/components/dashboard/PiiClassificationPanel.test.tsx` — panel states (first console component tests; this item also bootstraps the console vitest harness).

## Lifecycle / Forward-compatibility

`createDataClassificationGuard` ships `@experimental`, consistent with the sibling L2 factories' freeze convention. Field-level taint declassification is the named follow-up. The `data_classification` `GuardDescription` variant and the `validation.PII_*` basis codes are immutable once released (additive evolution only).
