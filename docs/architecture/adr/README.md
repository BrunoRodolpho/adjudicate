# Architecture Decision Records (ADRs)

This directory is the **authoritative, fine-grained record** of architecture
decisions for the `adjudicate` framework. Cross-cutting stances that span the
whole kernel and are not owned by a single ADR live in
[`../decisions.md`](../decisions.md); this directory holds the numbered,
individual decisions it indexes.

> **Truth discipline (ADR-144).** ADRs and the surrounding architecture docs
> (`AI_CONTEXT.md`, `docs/security/threat-model.md`,
> `docs/security/security-review-checklist.md`, `docs/concepts.md`,
> `SECURITY.md`) must agree with the **as-built code**, anchored to specific
> `file:line` citations. When prose and code disagree, the code wins and the
> prose is corrected — never the reverse. See
> [ADR-144](./ADR-144-doc-truth-reconciliation.md).

## Numbering

- ADRs are numbered `ADR-NNN`, starting at `ADR-101`.
- The **highest** ADR is `ADR-144`. The next free number is `ADR-145`.
- Numbers are never reused. A decision that reverses an earlier one is a **new**
  ADR whose `Status` of the old one becomes `Superseded` (and the new ADR
  lists the old in `Related` / "amends").
- A new ADR that *extends* an existing one keeps both `Accepted` and notes
  "amends ADR-NNN" in its title and `Related` (e.g. ADR-137 amends ADR-121,
  ADR-141 amends ADR-117, ADR-143 amends ADR-122).

## Header convention (copy `ADR-143` verbatim)

Every ADR opens with an `# ADR-NNN — <title>` heading, then a four-bullet
metadata block, then the body sections. The de-facto shape, normalized across
the directory (`ADR-105`..`ADR-112`, `ADR-116` were realigned to it by plan
122), is:

```markdown
# ADR-NNN — <short imperative title>

- **Status:** Accepted | Proposed | Superseded | Deprecated | Rejected
- **Date:** YYYY-MM-DD
- **Scope:** <package(s) / surface this decision governs>   (optional)
- **Supersedes:** none | ADR-NNN                            (optional)
- **Related:** ADR-NNN (why), `docs/...` (why)

## Context

What forced the decision — the problem, the constraint, the prior state.

## Decision

What we decided, concretely. Name the symbols / files / contracts.

## Why this shape

Why this option over the alternatives; what invariant it preserves.
```

`## Invariants preserved`, `## Alternatives considered`, `## Test coverage`,
and `## Lifecycle` are encouraged where they add signal (see `ADR-143`).

### Constitutional invariants an ADR may not contradict

ADRs document the kernel as built; they may not propose or retroactively bless
a violation of the constitutional invariants recorded in
[`docs/architecture/decisions.md` §5](../decisions.md) and
[`docs/concepts.md` §9](../../concepts.md). In particular:

- **Closed 6-outcome Decision algebra** (`EXECUTE | REFUSE | DEFER | ESCALATE |
  REQUEST_CONFIRMATION | REWRITE`); no 7th kind, no `confidence`/free
  `metadata` on `Decision`.
- **Guard order** `state → taint → auth → business → default`; taint
  short-circuits before auth.
- **Monotonicity** — every non-deterministic component may only *raise*
  friction, never lower it; only deterministic rules authorize `EXECUTE`.
- **Fail-closed** — a throwing guard becomes a `SECURITY`/`GUARD_PANIC`
  `REFUSE`; an I/O error on the write path aborts `EXECUTE` (no fail-open
  default).
- **Kernel purity** — `adjudicate()` is pure and synchronous; all stateful/IO
  facts are injected snapshots and recorded for replay.

## Index

The directory below is authoritative. The `Status` column is the ADR's own.

| ADR | Title | Status |
|---|---|---|
| [ADR-101](./ADR-101-kernel-audit-emission.md) | Kernel-side audit emission via `adjudicateAndAudit` | Accepted |
| [ADR-102](./ADR-102-audit-fail-closed-default.md) | Audit fail-closed by default | Accepted |
| [ADR-103](./ADR-103-runtime-context.md) | RuntimeContext for per-tenant isolation | Accepted |
| [ADR-104](./ADR-104-envelope-v2-nonce.md) | Envelope v2: nonce-based `intentHash` + auth-after-taint reorder | Accepted |
| [ADR-105](./ADR-105-guard-metadata.md) | Guard metadata as a closed semantic-interoperability vocabulary | Accepted |
| [ADR-106](./ADR-106-guard-exception-isolation.md) | Guard exception isolation | Accepted |
| [ADR-107](./ADR-107-refusal-messages-externalization.md) | `RefusalMessages` externalization | Accepted |
| [ADR-108](./ADR-108-primitives-expansion.md) | `@adjudicate/primitives` Layer 2 expansion | Accepted |
| [ADR-109](./ADR-109-analyze-tier1.md) | `@adjudicate/analyze` Tier 1 architecture + diagnostic catalog | Accepted |
| [ADR-110](./ADR-110-conformance-package.md) | `@adjudicate/conformance` shipped package | Accepted |
| [ADR-111](./ADR-111-audit-record-v4.md) | `AuditRecord` v4 additive fields + `verifyAuditRecord` | Accepted |
| [ADR-112](./ADR-112-observability-migrate.md) | Observability + Migrate package introduction | Accepted |
| [ADR-113](./ADR-113-adapter-core-extraction.md) | Adapter-core extraction | Accepted |
| [ADR-114](./ADR-114-kill-switch-v2.md) | Distributed kill switch v2: Redis pub/sub + polling fallback | Accepted |
| [ADR-115](./ADR-115-pack-trust-primitives.md) | Pack trust primitives: fingerprinting + signature verification | Accepted |
| [ADR-116](./ADR-116-post-v1-extension-discipline.md) | Post-v1 extension discipline | Accepted |
| [ADR-117](./ADR-117-data-classification-guard.md) | PII / data-classification guard + `data_classification` `GuardDescription` | Accepted |
| [ADR-118](./ADR-118-red-team.md) | `@adjudicate/red-team`: deterministic adversarial testing | Accepted |
| [ADR-119](./ADR-119-behavioral-drift.md) | `@adjudicate/drift`: behavioral/statistical drift detection | Accepted |
| [ADR-120](./ADR-120-token-budget-guard.md) | Token-budget guard + provider usage seam | Accepted |
| [ADR-121](./ADR-121-config-integrity-seal.md) | Configuration Integrity Seal | Accepted |
| [ADR-122](./ADR-122-approval-engine.md) | `@adjudicate/approval-engine`: human-approval orchestration | Accepted |
| [ADR-123](./ADR-123-command-risk-guard.md) | Command-Risk guard for CLI/terminal agents | Accepted |
| [ADR-124](./ADR-124-hallucination-scoring.md) | Hallucination scoring + `AuditRecord` v5 metadata | Accepted |
| [ADR-125](./ADR-125-policy-coherence-analyzer.md) | Tier-3 `PolicyCoherenceAnalyzer` (AJD-301) | Accepted |
| [ADR-126](./ADR-126-agent-memory-store.md) | Agent `MemoryStore` (cross-session planner context) | Accepted |
| [ADR-127](./ADR-127-ai-bom.md) | AI Bill-of-Materials (AI-BOM) generator | Accepted |
| [ADR-128](./ADR-128-web-parity-platform.md) | Cross-cutting web-parity platform | Accepted |
| [ADR-129](./ADR-129-pii-events.md) | PII Events drill-down read seam | Accepted |
| [ADR-130](./ADR-130-ai-bom-explorer.md) | AI-BOM Explorer (multi-pack list/detail + public transparency view) | Accepted |
| [ADR-131](./ADR-131-configuration-integrity.md) | Configuration Integrity aggregation surface | Accepted |
| [ADR-132](./ADR-132-behavioral-drift-history.md) | Behavioral Drift history surface | Accepted |
| [ADR-133](./ADR-133-red-team-history.md) | Red Team history surface | Accepted |
| [ADR-134](./ADR-134-command-risk.md) | Command-risk aggregation surface | Accepted |
| [ADR-135](./ADR-135-token-governance.md) | Token Governance (tenant + session budgets, exhaustion timeline) | Accepted |
| [ADR-136](./ADR-136-approval-center.md) | Approval Center (persisted registry + decision history + audit chain) | Accepted |
| [ADR-137](./ADR-137-per-decision-config-integrity.md) | Per-decision configuration integrity (amends ADR-121) | Accepted |
| [ADR-138](./ADR-138-session-risk-guard.md) | Session risk accumulation & guard | Accepted |
| [ADR-139](./ADR-139-pack-cli-agent.md) | `@adjudicate/pack-cli-agent` — default-deny terminal composition | Accepted |
| [ADR-140](./ADR-140-multi-pack-composition.md) | Multi-pack composition analysis (`analyzeComposition`) | Accepted |
| [ADR-141](./ADR-141-pii-pattern-infra.md) | PII pattern registry, input cap, out-of-path SHADOW (amends ADR-117) | Accepted |
| [ADR-142](./ADR-142-access-ttl-breakglass.md) | Access-grant TTL + break-glass (`envelope.createdAt` clock) | Accepted |
| [ADR-143](./ADR-143-approval-engine-governance.md) | Smart Approval Engine — channels, quorum, escalation, attestation (amends ADR-122) | Accepted |
| [ADR-144](./ADR-144-doc-truth-reconciliation.md) | Documentation-as-truth reconciliation discipline | Accepted |
