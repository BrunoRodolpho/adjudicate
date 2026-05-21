# ADR-109 — `@adjudicate/analyze` Tier 1 architecture + diagnostic catalog

**Status**: Accepted (2026-05-18 — M2 overnight execution)
**Supersedes**: none
**Related**: ADR-105 (guard metadata closed vocabulary), ADR-108 (primitives expansion)

## Context

The framework's enterprise-credibility claim depends on adopters being
able to *prove* their Pack is correct. Today, an adopter relies on
their own test suite — a perfectly valid but unstructured check.
What's missing: a *framework-supplied* static analyzer that catches a
defined set of policy mistakes and produces structured output (SARIF)
that adopters' CI pipelines ingest.

The analysis surface decomposes into three tiers:

- **Tier 1 (metadata-driven)** — reads `GuardMetadata` and Pack-level
  declarations. Pure function over the Pack object. No source-file AST
  walks. Cheap to run; high precision. **This ADR ships Tier 1.**

- **Tier 2 (symbolic)** — walks the guard source via the TypeScript
  Compiler API; verifies declared metadata matches the guard's actual
  behavior (e.g., REWRITE returns a payload mutating only the declared
  fields). Deferred to v0.4+.

- **Tier 3 (fuzz)** — generates envelopes from the Pack's state schema
  and runs them through `adjudicate()`, reporting per-Decision coverage
  and uncovered branches. Deferred to v0.5+.

## Decision

Ship `@adjudicate/analyze` v0.2 with Tier 1 only:

1. **Pipeline architecture.** `analyzePolicy({ pack, analyzers?, options? })`
   runs an ordered sequence of analyzers (default: `DEFAULT_ANALYZERS`).
   Each analyzer is a pure function (`Pack → ReadonlyArray<Diagnostic>`).
   Severity overrides + strict mode are presentation-time concerns
   applied after all analyzers run.

2. **Closed diagnostic catalog.** AJD-101 through AJD-106 are reserved
   for Tier 1; AJD-201+ for Tier 2; AJD-301+ for Tier 3. Codes are
   STABLE once shipped (the closed-vocabulary discipline from ADR-105
   applies): new diagnostics get new codes; old codes never change
   meaning.

3. **Six initial analyzers**:

   | Code | Analyzer | Default severity | Detects |
   |---|---|---|---|
   | AJD-101 | `MissingMetadataAnalyzer` | warning | Guards without name + description |
   | AJD-102 | `SignalConsistencyAnalyzer` | error | DEFER signals not in `Pack.signals` (and vice versa) |
   | AJD-103 | `BasisCodeConsistencyAnalyzer` | warning | Empty `Pack.basisCodes` |
   | AJD-104 | `RewriteScopeAnalyzer` | error | REWRITE metadata with empty `mutatesPayloadFields` |
   | AJD-105 | `TaintPolicyAnalyzer` | error | `taint.minimumFor(kind)` throws or returns non-Taint value |
   | AJD-106 | `DefaultPolarityAnalyzer` | warning | `policy.default === "EXECUTE"` (fail-open) |

4. **Three output formats**:
   - `text` — developer-friendly, line-per-diagnostic.
   - `json` — programmatic.
   - `sarif` — SARIF 2.1.0 for GitHub Code Scanning / GitLab Code Quality.

5. **CLI integration.** `adjudicate analyze --pack <module> [--format text|json|sarif] [--strict]`.
   Strict mode promotes all warnings to errors and exits non-zero on any
   error.

## Closed-vocabulary discipline (mirrors ADR-105)

1. The built-in diagnostic-code set is closed for interoperability
   guarantees; tooling MUST tolerate unknown codes for forward
   compatibility with experimental Tier 2/3 analyzers and private
   ecosystem analyzers.
2. New codes are additive within a tier (Tier 1 expands to AJD-107..AJD-110, etc.).
3. Existing codes are immutable once released — message wording is
   tolerated to change, but the code's meaning is frozen.
4. Severity is mutable across minor versions, following the standard
   deprecation policy.
5. Unknown codes MUST be ignored safely by tooling.

## Consequences

### Positive

- Adopters get a `pnpm dlx @adjudicate/cli analyze --pack <my-pack>`
  one-liner with structured CI integration.
- The Pack quality scoring spec (`docs/pack-ecosystem/quality-scoring.md`)
  references the analyzer: Silver tier requires `--strict` clean.
- ADR-108's new `createRewriteGuard` produces guards that the
  `RewriteScopeAnalyzer` (AJD-104) recognizes automatically.
- The PIX Pack's lack of `signals` declaration was caught by AJD-102 —
  proof that the analyzer fires on real (not fabricated) issues.
  Fixed PIX (and deploys) to declare signals as a side effect of M2.

### Negative

- Diagnostic codes are now public surface (24-month compat guarantee
  post-v1.0). The codes chosen here are committed.
- Tier 1 cannot reach into guard bodies — diagnostics from analyzers
  that need source-walking (Tier 2) are not available yet, so some
  Pack-author mistakes (REWRITE actually mutating an undeclared field
  despite metadata) still slip through. Tier 2 lands v0.4+.

### Neutral

- `assertPackConformance` is unchanged. The analyzer is an *additional*
  validation surface, not a replacement. Pack-load-time conformance
  remains synchronous; analyzer is a separate developer-time tool.

## Alternatives considered

### Single mega-analyzer with internal code switching

Rejected. Each diagnostic should be locatable in source by code. Six
small analyzers, each owning one code, scales additively (Tier 2/3
analyzers add more files; the pipeline architecture composes them).

### YAML/JSON Pack lint rules

Rejected. Per `docs/concepts.md §9.4`: stay in TypeScript. Lint rules
that read structured TS types are dramatically more precise than
string-pattern matches against generated YAML.

### Integrate with ESLint

Considered. Rejected for v0.2 because ESLint's rule shape is awkward
for "analyze a Pack object" — ESLint is source-file-keyed; the
analyzer is Pack-keyed. A future `@adjudicate/eslint-plugin-pack`
package may wrap the analyzer for in-IDE diagnostics.

### Pluggable per-Pack-author analyzers

Considered. Deferred to post-v1.0. The `analyzers?` array in
`analyzePolicy()` is the seam — adopters CAN ship custom analyzers
today; we just don't expose them via the CLI yet.

## CI integration example

```yaml
- run: pnpm dlx @adjudicate/cli analyze --pack . --format sarif > analyze.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: analyze.sarif
```

PR annotations show inline analyzer diagnostics; the SARIF appears in
the Security tab.

## Migration path

- v0.3 ships Tier 1 + CLI `analyze` command.
- v0.4 ships Tier 2 (symbolic execution via TypeScript Compiler API).
- v0.5 ships Tier 3 (fuzz). At this point `pack lint --strict` includes
  `analyze --strict` as a required gate.
- v1.0 freezes the AJD code catalog. Future tiers (Tier 4+) extend
  additively per closed-vocabulary discipline.

## References

- Implementation: `packages/analyze/src/`.
- CLI: `packages/cli/src/commands/analyze.ts`.
- Tests: `packages/analyze/tests/analyze.test.ts` (14 tests).
- ADR-105 governance model (this ADR mirrors it for diagnostics).
- SARIF 2.1.0 spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
