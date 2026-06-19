---
"@adjudicate/adapter-core": patch
"@adjudicate/core": patch
"@adjudicate/runtime": patch
"@adjudicate/approval-engine": patch
"@adjudicate/canonical": patch
---

docs(architecture,security): 122 — ADR scaffold + index, Status backfill, ADR-144, SECURITY.md reconciliation.

Documentation-only Layer-12 plan that finishes the doc-truth pass plan 121 began. NO kernel, executor, or audit code path is touched; every constitutional invariant (closed 6-outcome Decision algebra, `state→taint→auth→business→default` guard order, §C monotonicity, fail-closed default, kernel purity, the ADR-104 `intentHash` recipe) is preserved by construction. The §5 gates run the unchanged suites that PIN the documented behavior (`decisions.test.ts`, `resume.test.ts`, `guard-order.test.ts`) so the prose cannot silently outlive the code it describes.

- **ADR scaffold (T6, `docs/architecture/adr/README.md`).** The directory previously had no template / README / index (grep `template|readme|0000|index` returned zero). Added a README carrying the purpose, numbering rules, the canonical `ADR-143` header template (`# ADR-NNN — <title>` + `Status`/`Date`/`Scope`/`Supersedes`/`Related` bullets + `## Context`/`## Decision`/`## Why this shape`), the constitutional-invariant guardrails an ADR may not contradict, and the authoritative full index (ADR-101..ADR-144, all Accepted).

- **Status-line backfill (T6).** Normalized the 9 ADRs whose `Status` deviated from the de-facto `ADR-143` bullet shape — ADR-105..ADR-112 (were `**Status**: Accepted (date)`) and ADR-116 (was a `## Status` heading) — to the canonical `- **Status:** … / - **Date:** … / - **Related:** …` block, preserving each ADR's existing status value, date, supersedes, and related links verbatim (the M1/M2/M3 execution notes folded into the Date bullet; ADR-116 carried no explicit date so it states the v1.0-RC milestone honestly).

- **ADR-144 (T6, new, `docs/architecture/adr/ADR-144-doc-truth-reconciliation.md`).** New Accepted ADR recording the documentation-as-truth reconciliation discipline that plans 121/122 established: docs follow code, anchored to `file:line` citations, gated by the suites that pin the documented behavior; the six concrete drifts that were corrected (REWRITE re-adjudication, R2/`policyVersion` host-conditional binding, E3/DEFER-resume taint elevation, the dangling §9.5 anchors, the stale ADR range, the missing scaffold) are catalogued with their code anchors. Prose-only; preserves all invariants.

- **ADR index range (T5, `docs/architecture/decisions.md`).** The §4 authoritative-range line, corrected by 121 to ADR-101..ADR-143, is advanced to ADR-101..ADR-144 (new highest `ADR-144-doc-truth-reconciliation.md`); a pointer to `adr/README.md` and rows for ADR-143/ADR-144 added to the representative table. The "ADR-101..ADR-136" stale range remains absent.

- **SECURITY.md reconciliation (T6).** The coarse "In scope" list is reconciled with the as-built threat model: added the monotonicity/fail-closed ceiling, the taint-short-circuit guard order, the `auditHash` chain + host-conditional `policyVersion`/`kernelVersion` binding (matching threat-model R2), and the authority-guard IDOR caveat (real closure needs a host-injected authenticated principal), with pointers to `docs/security/threat-model.md`, `decisions.md §5`, and the ADR index. No overstated guarantee.
