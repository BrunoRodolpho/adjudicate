# Adjudicate — Execution Current State

## Current Milestone

**M2 (L2 + Analyzer + Registry foundations) — COMPLETE**

## Status Summary

| Milestone | Tasks Total | Complete | Deferred | Test Count |
|---|---|---|---|---|
| M1 | 23 | 23 | 0 | 770 (was 748) |
| M2 | 29 | 18 | 11 | 795 (+25) |
| M3 | 62 | 0 | 0 | — |
| M4 | 11 | 0 | 0 | — |
| **Total** | **125** | **41** | **11** | — |

## M2 Deliverables

### Completed
- ✅ T-024 createRewriteGuard
- ✅ T-025 createConfirmGuard
- ✅ T-026 createEscalateGuard
- ✅ T-027 createIdempotencyGuard
- ✅ T-031 Replay regression (no Pack refactor happened; replay-safe by construction)
- ✅ T-032 ADR-108 primitives expansion
- ✅ T-033 Pack metadata schema additions (PIX + deploys declare signals; KYC already had them)
- ✅ T-037 docs/pack-ecosystem/quality-scoring.md
- ✅ T-038 docs/pack-ecosystem/registry-foundations.md
- ✅ T-039 docs/pack-ecosystem/signing-design.md
- ✅ T-040 @adjudicate/analyze package scaffolded
- ✅ T-041 analyzePolicy() pipeline + AnalysisReport types
- ✅ T-042 MissingMetadataAnalyzer (AJD-101)
- ✅ T-043 SignalConsistencyAnalyzer (AJD-102)
- ✅ T-044 BasisCodeConsistencyAnalyzer (AJD-103)
- ✅ T-045 RewriteScopeAnalyzer (AJD-104)
- ✅ T-046 TaintPolicyAnalyzer (AJD-105)
- ✅ T-047 DefaultPolarityAnalyzer (AJD-106)
- ✅ T-049 CLI `adjudicate analyze` command
- ✅ T-050 SARIF output
- ✅ T-052 ADR-109 analyzer architecture

### Deferred (with rationale in decisions-log.md)
- T-028..T-030 (Pack consumption refactors) — D-005
- T-034..T-036 (Pack template variants + CLI integration) — D-006, deferred to M3
- T-048 (assertPackConformance → analyzer migration) — deferred to v0.5
- T-051 (GuardMetadata rate_limit variant) — deferred to M3

## Tags

- ✅ `v0.2.0-local` (M1 complete)
- 🎯 `v0.3.0-local` (M2 complete — pending this commit)

## Key wins from M2

1. The PIX pack lacked `signals` declaration — the analyzer caught this
   real bug at AJD-102 and forced a fix. Same for `pack-deployments-approval`.
   Both Packs now declare their wire signals.
2. The analyzer runs in <1 second against any Pack and produces SARIF
   that GitHub Code Scanning ingests directly.
3. Four new L2 factories ship without disturbing existing Packs
   (replay-safe by construction).

## ADRs

- ADR-106, ADR-107 (M1) — accepted
- ADR-108 (primitives expansion) — accepted
- ADR-109 (analyzer architecture) — accepted
