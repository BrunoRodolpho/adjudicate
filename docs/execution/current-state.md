# Adjudicate — Execution Current State

> Live status board. Updated continuously during the overnight run.

## Baseline (pre-M1)

- Branch: `claude/unruffled-bassi-305034`
- Baseline test count: **748 passing** across 90 test files
- Baseline lint: clean
- ADRs: 5

## Current Milestone

**M1 (Foundation + Safety) — COMPLETE**

## Status Summary

| Milestone | Tasks Total | Complete | In Progress | Blocked | Deferred |
|---|---|---|---|---|---|
| M1 | 23 | 23 | 0 | 0 | 0 |
| M2 | 29 | 0 | 0 | 0 | 0 |
| M3 | 62 | 0 | 0 | 0 | 0 |
| M4 | 11 | 0 | 0 | 0 | 0 |
| **Total** | **125** | **23** | **0** | **0** | **0** |

## M1 Deliverables

- ✅ T-001 BASIS_CODES.kernel.GUARD_PANIC
- ✅ T-002 Guard exception isolation in _adjudicateImpl
- ✅ T-003 Trace variant verified (shared impl)
- ✅ T-004 Property tests for guard panic (9 new tests)
- ✅ T-005 Resume-hash re-derivation in resumeDeferredIntent
- ✅ T-006 Resume-hash re-derivation in adapter.resume()
- ✅ T-007 Resume-hash re-derivation in adapter.confirm()
- ✅ T-008 Integration tests for tampered park blobs (9 new tests)
- ✅ T-009 @adjudicate/locales-pt-BR package scaffold
- ✅ T-010 RefusalMessages interface in core
- ✅ T-011 8 PT-BR strings replaced with English defaults
- ✅ T-012 portugueseRefusalMessages exported + localizeDecision wired
- ✅ T-013 bench/ workspace scaffolded
- ✅ T-014 kernel.bench.ts (adjudicate, adjudicateWithTrace, buildEnvelope)
- ✅ T-015 audit.bench.ts (adjudicateAndAudit)
- ✅ T-016 docs/perf/v0.2-baseline.md published
- ✅ T-017 Sigstore signing GitHub workflow
- ✅ T-018 npm provenance attestations enabled
- ✅ T-019 CycloneDX SBOM generation per release
- ✅ T-020 v0.2.0 version bump across all packages
- ✅ T-021 docs/execution/ state docs scaffold
- ✅ T-022 ADR-106 guard exception isolation
- ✅ T-023 ADR-107 RefusalMessages externalization

## Test Counts

- M1 start: 748 tests passing
- M1 end: **770 tests passing** (+18 = guard-panic 9 + resume-hash 9 + locales 4)

## Tags

- `v0.2.0-local`: PENDING (after this commit)
- `v0.3.0-local`: pending M2 completion
- `v0.4.0-local`: pending M3 completion
- `v0.5.0-local`: pending M4 completion

## Performance Baseline

`adjudicate()` EXECUTE p99: 0.7µs (2.2M ops/sec)
`adjudicate()` REWRITE p99: 6.5µs (244k ops/sec)
`adjudicate()` REFUSE p99: 0.5µs (3.2M ops/sec)
`adjudicateAndAudit()` REFUSE p99: 9.5µs (151k ops/sec)
All with >200× headroom against SLO targets.

## ADRs

- ADR-106 (guard exception isolation) — accepted
- ADR-107 (RefusalMessages externalization) — accepted
