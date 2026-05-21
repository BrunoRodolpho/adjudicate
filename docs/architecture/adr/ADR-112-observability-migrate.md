# ADR-112 — Observability + Migrate package introduction

**Status**: Accepted (2026-05-18 — M3 overnight execution)
**Related**: ADR-101 (kernel audit emission), ADR-103 (runtime context), ADR-105 (closed vocabulary)

## Context

Two complementary concerns landed in M3:

### Observability

The kernel emits `MetricsSink` events (decision, refusal, ledger op,
sink failure, resource limit, shadow divergence) and `LearningSink`
events (per-decision outcome with guardId + planFingerprint). These
flow to user-supplied sinks — but every OSS adopter writes their own
adapter to OpenTelemetry, Datadog, or Sentry.

Shipping a framework-supplied OTLP adapter eliminates the duplication
and locks in semantic-convention names (e.g., `adjudicate.decision.kind`)
so downstream dashboards interoperate.

### Migrate

ADR-105 introduced `withMetadata(g, m)`. `nameGuard("foo", g)` is the
canonical pattern for the name-only case. Adopters writing Packs in
2026–2027 use both — eventually we'll deprecate `nameGuard` and
prefer the explicit `withMetadata(g, { name: "foo" })` form.

The codemod infrastructure ships now so the deprecation has a
mechanical migration path. First codemod:
`nameGuard("foo", expr)` → `withMetadata(expr, { name: "foo" })`.

## Decision

Ship two new packages:

### `@adjudicate/observability` v0.4.0

Three core exports:

```ts
createOtlpMetricsSink({ exporter }) → MetricsSink
createOtlpLearningSink({ exporter }) → LearningSink
createOtlpAuditSpanExporter({ exporter, inner }) → AuditSink
```

Each takes an injectable `Exporter` interface (one method:
`export(event)`). A framework-supplied `createInMemoryExporter()`
captures events into an array for tests. Adopters wiring real OTLP
pass an exporter that forwards to OpenTelemetry SDK; that integration
is adopter-supplied (we don't pin OTel SDK).

The `SEMCONV` constants are STABLE wire-side surface:

```ts
SEMCONV.INTENT_KIND     = "adjudicate.intent.kind"
SEMCONV.DECISION_KIND   = "adjudicate.decision.kind"
SEMCONV.TAINT           = "adjudicate.taint"
SEMCONV.POLICY_VERSION  = "adjudicate.policy.version"
SEMCONV.PACK_ID         = "adjudicate.pack.id"
SEMCONV.LATENCY_MS      = "adjudicate.latency.ms"
SEMCONV.INTENT_HASH     = "adjudicate.intent.hash"
SEMCONV.GUARD_ID        = "adjudicate.guard.id"
```

Renaming any attribute is a MAJOR version bump.

### `@adjudicate/migrate` v0.4.0

Codemod runner + first codemod:

```ts
runCodemod({ codemod, globs, options }) → CodemodReport
applyNameGuardToWithMetadata(sourceFile) → CodemodChange[]
nameGuardToWithMetadata: CodemodDescriptor
```

CLI: `adjudicate-migrate name-guard-to-with-metadata <glob>`.

Uses ts-morph (TypeScript Compiler API wrapper). Handles:
- Multi-import preservation
- Existing `withMetadata({ ... })` merge
- `kernel.nameGuard` namespace-imported calls (skipped — adopter
  normalizes import first)
- Idempotent re-runs
- Multi-call rewrites in a single file

## Closed-vocabulary discipline for SEMCONV

Per ADR-105:
1. Existing attribute names are immutable once released.
2. New attributes are additive (`adjudicate.<namespace>.<noun>`).
3. Tooling MUST tolerate unknown attributes.
4. Severity / cardinality may change across minors with deprecation
   policy.

## Consequences

### Positive

- OSS adopters get one-line OTLP integration.
- Dashboards built on `adjudicate.decision.kind` interoperate across
  adopters.
- Codemod infrastructure unblocks deprecation of `nameGuard` (and
  future API renames).

### Negative

- `Exporter` interface is intentionally narrower than OTel's
  `SpanExporter`. Adopters wanting full OTLP/proto wire a thin
  adapter on top. Documented in package README.
- `nameGuard` is now scheduled for deprecation (v0.5+). Pack authors
  using it today are not affected immediately — the codemod is
  available when they're ready.

### Neutral

- Both packages are additive. Existing code is unchanged.

## Migration path

- v0.4 ships both packages.
- v0.5 deprecates `nameGuard` (1-cycle warning). Pack authors run
  `npx @adjudicate/migrate name-guard-to-with-metadata 'src/**/*.ts'`.
- v1.0 evaluates `nameGuard` removal (likely deferred to v2.0).

## References

- Implementation:
  - `packages/observability/src/`
  - `packages/migrate/src/`
- Tests:
  - `packages/observability/tests/exporter.test.ts` (9 tests)
  - `packages/migrate/tests/codemod.test.ts` (10 tests)
