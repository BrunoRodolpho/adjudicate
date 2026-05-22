# Post-v1 strategy

> **Status.** Strategic. Evidence-driven direction for the v1 line.
> Not a feature wishlist — every entry below is annotated with the
> evidence that would justify it and the discipline that would govern
> it.
>
> Companion to [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md),
> [`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md),
> [`docs/architecture/LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md),
> and [`docs/pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md).
>
> The framework is now a *governance substrate*. Its job is to remain
> deterministic, replayable, auditable, and trustworthy for years —
> not to grow.

---

## 1. Framing

Three time horizons. Each has a distinct success criterion.

| Horizon          | Window      | Success criterion                                                                 |
|---|---|---|
| **Near**         | v1.0 → v1.x  | Adoption-evidence cleared (kill-switch v2 production profile, AuditEventBus fan-out). Defaults flipped per `V1_FREEZE_MATRIX.md §26`. |
| **Mid**          | v1.x → v2.0  | Ecosystem self-sustainable. Pack authors operate without framework-team help. Multi-runtime parity demonstrated by at least one third-party runtime. |
| **Far**          | v2.0 → v3.0  | Substrate longevity. No load-bearing invariant has shifted. Replay over years-old records still classifies as `IDENTICAL`/`BASIS_ONLY`. |

The strategy below is *what we work on*, sorted by horizon and
classified by evidence required.

---

## 2. Safe evolution areas

These are areas where additive evolution is consistent with the
framework's identity. Work here is welcome when adopter pull justifies
it.

### 2.1 Adopter ergonomics (mid)

- **More codemods.** Every `@deprecated` marker ships with one.
  Adopter pain when migrating is the trigger.
- **Replay-narrative depth.** `explainReplayReport` + supersession
  narration cover the common cases; richer narratives wait for adopter
  feedback on incident triage.
- **More analyzer diagnostics.** `AJD-2NN` AST checks expand based on
  the failure patterns adopters report. Per-diagnostic severity is
  adopter-controllable.
- **More conformance checks.** New invariants discovered through
  property testing or operational incidents go through `AC-NNN`. The
  current AC-001..AC-006 is the minimum; future invariants land
  additively when the test surface justifies them.

### 2.2 Pack ecosystem health (mid)

- **Optional pluggable registry interface.** *Only* when an adopter
  needs to gate Pack installation against their internal index. The
  interface lives in `@adjudicate/conformance`; the framework does not
  host the registry.
- **Pack-discovery convention extensions.** The npm-tag convention is
  the discovery primitive. Adopter-driven additions (e.g., a
  `@adjudicate-community` umbrella organisation) are governance
  decisions, not framework changes.

### 2.3 Multi-runtime expansion (mid)

- **Cross-runtime conformance harness.** The vector file + the
  conformance spec (`MULTIRUNTIME_CONFORMANCE.md`) are the minimum
  artifacts. A reference Rust/Go/Python implementation lands only when
  an adopter commits to maintaining it.
- **Replay-equivalence test suite.** Beyond hash vectors: a small set
  of `(envelope, state, policy) → expected_decision` vectors that any
  conformant runtime evaluates. Land alongside the first non-Node
  runtime.
- **Cross-runtime audit-record loader.** Audit-postgres ingest from a
  Go-emitter is the next test for cross-runtime parity.

### 2.4 Governance intelligence (mid)

- **Replay-drift dashboards.** `classifyReplayDrift` produces the
  signal; adopter-side dashboards present it. The framework keeps the
  primitive deterministic; the visualisation is an adopter concern.
- **Pack-health dashboards.** `scorePackHealth` produces the score;
  adopters render it however fits their UI. The framework does not
  ship a dashboard.
- **Supersession-chain analytics.** `buildSupersessionChains` walks
  the chains; adopters compose chain summaries into operator UIs.

### 2.5 Operational maturity (near + mid)

- **Kill-switch v2 production profile.** Adopter evidence resolves the
  evidence-gate (`V1_FREEZE_MATRIX.md §26`). On confirmation, freeze
  the option defaults.
- **AuditEventBus production fan-out.** Same evidence gate as above.
- **Console UX maturation.** `apps/console` migrates to the
  AuditEventBus + WebSocket bridge when an adopter reports the polling
  cost. Not a framework-side push; adopter-side migration.
- **Restart-mid-flow integration test.** A combined integration test
  that restarts the process with active DEFER + REQUEST_CONFIRMATION
  state. Pending adopter-side test infrastructure.

---

## 3. Permanently frozen invariants

For completeness — these never change in the v1 line. Re-evaluate at
v2 cut only.

1. Closed `Decision` algebra (6 kinds).
2. Closed `Taint` lattice (3 levels).
3. Closed `RefusalKind` enum (6 categories).
4. Closed `BasisCategory` set (11 categories).
5. Guard evaluation order (`state → taint → auth → business → default`).
6. Fail-closed default (throwing guard → `kernel.GUARD_PANIC` SECURITY REFUSE).
7. Determinism guarantee on `adjudicate()`.
8. `intentHash` recipe (RFC 8785 JCS over the v2 subset).
9. `auditHash` recipe (record minus `auditHash + signature`).
10. `AuditRecord` schema additivity.
11. Pack isolation (`installPack` freezes).
12. Adopter-controlled clocks/ledgers/sinks via `deps`.
13. ProviderBridge<H> shape (three methods).
14. Wire-format equivalence across multi-runtime implementations.

Cross-reference: [`docs/architecture/LONG_HORIZON_AUDIT.md §10`](../architecture/LONG_HORIZON_AUDIT.md).

---

## 4. Ecosystem opportunities

Direction the framework actively welcomes external contributors to
pursue:

- **Third-party Packs in regulated verticals.** PIX, KYC, deployments
  ship as references. PCI / HIPAA / GDPR-specific Packs from domain
  experts are how the substrate proves its value.
- **Third-party adapters.** Vercel AI, Bedrock, Gemini, browser-side
  inference. The < 200-line PR shape (per `AI_CONTEXT.md`) means
  adapter authors stay productive.
- **Locale tables.** pt-BR ships; expansion to other locales follows
  the same shape.
- **CLI integrations.** Editor plugins, CI templates, registry
  indexers — the CLI is intentionally composable.

---

## 5. Adoption blockers — currently known

Things adopters cite as preventing wider use. Each requires its own
evidence-driven response.

### 5.1 No hosted control plane

**Adopter ask.** Some adopters want a hosted dashboard.

**Framework position.** Decline. The decentralised substrate property
is load-bearing (`ECOSYSTEM_HEALTH_MODEL.md §1.3`). Adopters who want
hosted control plane self-host the open-source `apps/console`.

### 5.2 No marketplace

**Adopter ask.** "Where do I find Packs?"

**Framework position.** Decline. npm + `validatePackManifest` is the
discovery primitive. A curated index can emerge community-side; the
framework will not run one.

### 5.3 No first-party signing service

**Adopter ask.** "Sign my Packs for me."

**Framework position.** Decline. Adopter-controlled signing is the
trust model. Sigstore / OIDC / Rekor integration ships *as
documentation* — adopters wire their preferred service.

### 5.4 Limited locale coverage

**Adopter ask.** Refusal messages in their language.

**Framework position.** Adopter-controlled. `RefusalMessages`
injection point exists; English defaults ship with the kernel. New
locale packages welcome.

### 5.5 Limited adapter coverage

**Adopter ask.** Adapter for X.

**Framework position.** < 200-line PR per adapter. Welcome.

---

## 6. Out-of-scope (do not become)

Direction the framework explicitly rejects, with rationale. Re-litigating
requires an ADR explicitly addressing the rejection.

| Direction                                  | Why out of scope |
|---|---|
| Workflow engine                            | Recreates Airflow/Temporal; loses the per-decision substrate identity. |
| Agent runtime / orchestration platform     | Loses determinism; widens attack surface; mis-shapes the substrate. |
| Generalised plugin host                    | Loses determinism + audit guarantees. |
| Edge-deployed adjudication / sovereign-AI compute | 2026-evidence-failed shift; not the framework's domain. |
| Hosted Pack registry                       | Centralises ecosystem; violates §2 of `ECOSYSTEM_HEALTH_MODEL.md`. |
| MCP-style separate Pack registry           | Same centralisation problem; npm is the registry. |
| YAML/JSON Pack DSL                         | DSL-proliferation failure mode; Packs stay TypeScript. |
| `record.explain()` method on AuditRecord   | Records are values; methods kill JSON round-trip. |
| `Decision.metadata` / `Decision.confidence` field | Closed algebra; widens the load-bearing enum. |
| Post-hoc LLM output filter as kernel feature | Out of content-moderation business. |
| Phone-home telemetry                       | Violates the local-first design of `createEcosystemTelemetry`. |
| Framework-issued signing CA                | Centralises trust; violates `ECOSYSTEM_HEALTH_MODEL.md §10`. |

This list lives. A direction lands on it when the framework rejects
the change explicitly; it leaves the list only via an ADR that
documents new evidence.

---

## 7. Adoption-evidence pipeline

The framework evolves on evidence, not editorial taste. The evidence
sources, in order of preference:

1. **Adopter incident reports.** Real outages, real bugs, real triage
   experiences. Highest signal-to-noise ratio.
2. **Adopter usage telemetry.** Local-first snapshots from
   `createEcosystemTelemetry` that adopters voluntarily share.
3. **External Pack-author feedback.** "I wanted to do X but the
   substrate didn't help" → evidence for a primitive addition.
4. **Conformance / analyzer false-positive triage.** Tracked via
   `AnalyzerTriageSnapshot`; informs default severities.
5. **Replay-drift trends.** `classifyReplayDrift` outputs across the
   Pack ecosystem inform regression risk.
6. **External academic / industry research.** When findings apply,
   they go through ADR review.

Speculative signal sources (Twitter, marketing wish lists, framework-
team aesthetic) do not justify additions.

---

## 8. Multi-runtime expansion strategy

The framework is currently Node-only at the kernel level. Expansion is
opportunistic, not framework-driven:

- **First non-Node runtime.** Lands when an adopter commits to
  maintaining it. The framework provides the spec, the vectors, and
  the conformance harness; the runtime is community-owned.
- **Reference runtimes.** The framework does not commit to maintaining
  reference Rust/Go/Python kernels. Documentation and vectors are the
  framework's contribution.
- **Cross-runtime CI.** When the first non-Node runtime stabilises,
  the vector file becomes the cross-runtime gate. The Node reference
  re-runs its vectors on every release; the non-Node runtime re-runs
  the same vectors on every release; divergences are bugs in whichever
  runtime drifted.

The framework does *not* aim for "one substrate, every language" as a
goal. The goal is: "the wire format and the audit format are stable
enough that *if* an adopter wants multi-runtime, they can build it
without framework involvement."

---

## 9. Sustainable maintenance posture

The framework is run by a small core team. Sustainable maintenance
posture, applied at every PR review:

- **No PR without a CHANGELOG entry.** Hidden surface changes are
  forbidden.
- **No PR that increases the freeze-matrix surface without a freeze-
  matrix row.** The matrix is the contract.
- **No PR that adds a primitive without a Pack consumer or an evidence
  link.** Speculative primitives bloat the ecosystem.
- **No PR that introduces a new external dependency without an ADR.**
  Dependencies are forever.
- **No PR that re-litigates an out-of-scope direction without an
  ADR.** Decisions stay decided.

This posture preserves the framework's ability to ship coordinated
MAJORs years from now. The cost of every new surface is paid by the
maintainers for the life of the v1 line.

---

## 10. Health metrics

Post-v1 the framework tracks (when adopters report via opt-in
telemetry):

- **Test count.** Currently 1036; growth via additive primitives and
  invariants is expected.
- **ADR count.** Currently 116; growth tracks architectural decisions.
- **Freeze-matrix coverage.** Every public export classified; gaps
  flagged by `check-freeze-matrix.ts`.
- **Conformance pass rate** across the in-tree Pack set.
- **Replay-drift incidence** per release tag (via
  `classifyReplayDrift`).
- **Pack-health distribution** across observed Packs (via
  `scorePackHealth`).
- **Cross-runtime vector pass rate** when multi-runtime implementations
  land.

These metrics inform the next release cycle's risk classification.
None of them are externally collected — adopters opt in.

---

## 11. Re-evaluation cadence

This document is re-evaluated at every MAJOR cut. The "permanently
frozen invariants" section is the durable contract. The "safe
evolution areas" and "out-of-scope" sections can shift only via
explicit ADR.

Between MAJORs, this document remains stable. The framework's value
to adopters is *predictability of evolution* over years; the strategy
document is part of that predictability.
