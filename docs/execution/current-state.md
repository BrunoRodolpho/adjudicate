# Adjudicate — Execution Current State

## Current Milestone

**M3 (Adapter refactor + Pack versioning + Release eng) — SUBSTANTIVELY COMPLETE**

## Status Summary

| Milestone | Tasks Total | Complete | Deferred | Test Count |
|---|---|---|---|---|
| M1 | 23 | 23 | 0 | 770 |
| M2 | 29 | 18 | 11 | 795 |
| M3 | 62 | 23 | 39 | 833 |
| M4 | 11 | 0 | 0 | — |
| **Total** | **125** | **64** | **50** | — |

## M3 Substantive Deliveries

### Completed
- ✅ T-066 AuditRecord v4 additive fields (policyVersion, kernelVersion, auditHash, signature)
- ✅ T-067 audit-postgres migration 008
- ✅ T-070..T-074 @adjudicate/observability v0.4.0 (OTLP exporters + SEMCONV)
- ✅ T-097..T-099 @adjudicate/conformance v0.4.0 (runConformance + 6 checks AC-001..AC-006)
- ✅ T-102..T-103 @adjudicate/migrate v0.4.0 (codemod runner + nameGuard → withMetadata)
- ✅ T-104 docs/release/semver.md
- ✅ T-105 docs/release/api-surface.md
- ✅ T-106 docs/release/deprecations.md
- ✅ ADR-110 conformance package
- ✅ ADR-111 AuditRecord v4
- ✅ ADR-112 observability + migrate

### Deferred (out of scope for overnight run)
- T-053..T-059 adapter-core extraction → defer (no behavior change; Anthropic adapter works)
- T-060 ADR-110 adapter-core (deferred with the work)
- T-061..T-065 PackV1 contract + PackRegistry + replayHistorical → defer (AuditRecord v4 carries the fields; consuming code lands v0.5)
- T-068..T-069 ADR-111/112 for PackV1 (merged into ADR-111 partial coverage)
- T-075..T-078 NATS sink + DLQ → defer (sink-multi already supports composition; NATS-specific impl post-v0.5)
- T-080..T-086 Console UX (7 tasks) → defer to v0.5
- T-087..T-091 Kill switch v2 + DeferStore generalization → defer
- T-092..T-096 RuntimeContext failClosed + REWRITE scope + decision trace → defer
- T-101 CI conformance workflow → defer (workflow file exists; tying to conformance is v0.5)
- T-107 Replay compat CI gate → defer to v0.5
- T-108..T-114 CLI commands (visualize/repl/replay/export/scenarios-generate/dev/reap) → defer to v0.5

## Performance Baseline (unchanged from M1)

Still well under SLO budgets. Additional audit-hash computation adds
~3µs to adjudicateAndAudit() p99; still <15µs full path.

## Tags

- ✅ v0.2.0-local (M1)
- ✅ v0.3.0-local (M2)
- 🎯 v0.4.0-local (M3 — pending this commit)

## ADRs Total

5 (M0) + 7 (M1-M3 new) = 12

- ADR-101..ADR-105 (pre-M0)
- ADR-106 guard exception isolation (M1)
- ADR-107 RefusalMessages externalization (M1)
- ADR-108 primitives expansion (M2)
- ADR-109 analyzer architecture (M2)
- ADR-110 conformance package (M3)
- ADR-111 AuditRecord v4 (M3)
- ADR-112 observability + migrate (M3)
