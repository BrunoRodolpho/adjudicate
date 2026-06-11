# ADR-112 — Observability + Migrate package introduction

**Status**: Accepted (2026-05-18 — M3 overnight execution)
**Related**: ADR-101 (kernel audit emission), ADR-103 (runtime context), ADR-105 (closed vocabulary), ADR-124 (hallucination scoring)

## Context

Two complementary concerns landed in M3.

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
canonical pattern for the name-only case. `nameGuard` is a thin facade
over `withMetadata({ name })` and is slated for eventual deprecation in
favor of the explicit form once the guard-metadata surface absorbs more
fields. Shipping the codemod infrastructure now gives that deprecation a
mechanical migration path. First codemod:
`nameGuard("foo", expr)` → `withMetadata(expr, { name: "foo" })`.

## Decision

Ship two new packages.

### `@adjudicate/observability`

Three core sink factories, each adapting a kernel sink contract onto a
single injectable `Exporter` interface (one method: `export(event)`):

```ts
createOtlpMetricsSink({ exporter }) → MetricsSink
createOtlpLearningSink({ exporter }) → LearningSink
createOtlpAuditSpanExporter({ exporter, inner }) → AuditSink
```

A framework-supplied `createInMemoryExporter()` captures events into an
array for tests; `noopExporter()` discards them. Adopters wiring real
OTLP pass an exporter that forwards to the OpenTelemetry SDK; that
integration is adopter-supplied (we don't pin the OTel SDK — only the
interface-only `@opentelemetry/api` is a dependency).

Observability is OPTIONAL plumbing and MUST NEVER affect a Decision
outcome: if the exporter throws, the sink swallows the error; if it is
misconfigured, telemetry is silent but adjudication still runs.

The `SEMCONV` constants are STABLE wire-side surface — `adjudicate.*`
attribute names that dashboards, alerts, and SIEM rules build on.
The canonical, documented list lives in
`packages/observability/src/semconv.ts`; it is not re-listed here so the
two never drift. Renaming an existing attribute is a MAJOR version bump;
new attributes are added there per the closed-vocabulary policy below.

### `@adjudicate/migrate`

Codemod runner + first codemod. Public surface (`src/index.ts`):

```ts
runCodemod({ id, globs, dryRun }) → Promise<CodemodReport>
listCodemods() → readonly CodemodDescriptor[]
applyNameGuardToWithMetadata(sourceFile) → CodemodChange[]   // single-file
runNameGuardToWithMetadata(globs, options) → Promise<CodemodReport>  // glob runner
nameGuardToWithMetadata: CodemodDescriptor                   // registered descriptor
```

`runCodemod` routes `id` to a registered `CodemodDescriptor` and forwards
the globs; new codemods register by appending to the `CODEMODS` array in
`runner.ts`.

CLI (bin `adjudicate-migrate`):
`adjudicate-migrate <codemod-id> <glob...> [--dry-run]`,
plus `adjudicate-migrate list`.

Uses ts-morph (TypeScript Compiler API wrapper). The name-guard codemod
handles:
- Multi-import preservation
- Existing `withMetadata({ ... })` merge
- `kernel.nameGuard` namespace-imported calls (skipped — adopter
  normalizes import first)
- Idempotent re-runs
- Multi-call rewrites in a single file
- Conservative skips: ambiguous shapes are reported as `Skip`, never
  silently rewritten.

## Closed-vocabulary discipline for SEMCONV

Per ADR-105:
1. Existing attribute names are immutable once released.
2. New attributes are additive (`adjudicate.<namespace>.<noun>`).
3. Tooling MUST tolerate unknown attributes.
4. Severity / cardinality may change across minors with deprecation
   policy.

The SEMCONV vocabulary has grown additively under this policy since M3
(adapter-loop, pause/defer, kill-switch, provider, and hallucination
attributes have been added). `semconv.ts` is the source of truth.

## Consequences

### Positive

- OSS adopters get one-line OTLP integration.
- Dashboards built on `adjudicate.decision.kind` interoperate across
  adopters.
- Codemod infrastructure unblocks deprecation of `nameGuard` (and
  future API renames).

### Negative

- The `Exporter` interface is intentionally narrower than OTel's
  `SpanExporter`. Adopters wanting full OTLP/proto wire a thin adapter
  on top. Documented in the package README.
- `nameGuard` is scheduled for eventual deprecation. Pack authors using
  it today are not affected immediately — the codemod is available when
  they're ready (`npx @adjudicate/migrate name-guard-to-with-metadata 'src/**/*.ts'`).

### Neutral

- Both packages are additive. Existing code is unchanged.

## Subsequent additions

These ADR-era packages have grown additively since acceptance; this ADR
captures the original contract, not the full current export surface (see
each package's `index.ts`). Notable later additions to
`@adjudicate/observability`:

- Hallucination scoring — `bucketHallucinationScore`,
  `createHallucinationMetadataProvider`,
  `createLexicalGroundednessScorer` (ADR-124; the
  `adjudicate.hallucination.*` SEMCONV keys).
- Ecosystem telemetry — `createEcosystemTelemetry`,
  `serializeEcosystemSnapshot`, `classifyReplayFailure`: an opt-in,
  local-first, deterministic aggregator the framework never instantiates.

## References

- Implementation:
  - `packages/observability/src/`
  - `packages/migrate/src/`
- Tests:
  - `packages/observability/tests/exporter.test.ts`
  - `packages/observability/tests/hallucination.test.ts`
  - `packages/observability/tests/ecosystem-telemetry.test.ts`
  - `packages/migrate/tests/codemod.test.ts`
- Deprecation calendar: `docs/release/deprecations.md`
