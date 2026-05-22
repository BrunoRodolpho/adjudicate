# Post-v1 audit report

> **Status.** Snapshot at the close of the post-v1 disciplined-evolution
> phase. Companion to [`V1_CERTIFICATION_REPORT.md`](./V1_CERTIFICATION_REPORT.md)
> (the v1.0-RC certification) and [`POST_V1_STRATEGY.md`](./POST_V1_STRATEGY.md)
> (forward strategy).
>
> Audit date: 2026-05-21.
> Audit branch: `claude/unruffled-bassi-305034`.
> Audit HEAD: post-v1 additions on top of v1.0-RC certification.

---

## Executive summary

The framework has completed the transition from "v1.0 release candidate"
to "post-v1 disciplined evolution." The change set is intentionally
small, additive, and reversible:

- **No frozen surface was touched.** Every public surface listed in
  [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md) §1–§28 remains
  exactly as it was at v1.0-RC.
- **New primitives are MINOR-bumpable** and opt-in. The kernel, the
  wire format, the audit-record schema, the canonical-JSON hash recipe,
  the closed enums, and the conformance harness are unchanged.
- **Governance discipline is now codified.** Six new normative
  documents (post-v1 strategy, semver governance, extension policy,
  ecosystem health model, multi-runtime conformance, operator guide)
  pin the framework's evolution rules. ADR-116 captures the post-v1
  extension discipline.
- **Cross-runtime parity has been strengthened.** Three new envelope
  vectors + two audit-record-subset vectors expand the language-neutral
  conformance suite.
- **Operational intelligence primitives** add five small composable
  tools (telemetry aggregator, replay-drift classifier, Pack-health
  diagnostics, supersession-chain analytics, kill-switch timeline) —
  each pure, deterministic, closed-vocabulary.

**Test posture: 1084 passing / 1 skipped / 0 failing.** Up from 1022 at
the v1.0-RC cut. All additions land alongside their own tests.

The framework is now ready to operate as **production-grade governance
infrastructure for the v1 lifetime**.

---

## §1 — Ecosystem readiness

### 1.1 Adoption scalability

| Property                                                       | Status                                                              |
|---|---|
| Pack authoring without framework-team help                     | ✓ — `pack-init` scaffold + `analyze` + `runConformance` end-to-end.    |
| Decentralised distribution (no framework-side registry)        | ✓ — npm-tag convention + `validatePackManifest`.                        |
| Adopter-controlled trust roots (no framework-issued CA)        | ✓ — `verifyPackTrust` with adopter-supplied PEMs.                       |
| Bounded cardinality across the SEMCONV surface                 | ✓ — every attribute documented with cardinality class in §19 of matrix. |
| Health primitives composable into CI gates                     | ✓ (NEW) — `scorePackHealth` + `verifyPackTrust` + `runConformance`.      |
| Replay-drift detectable across release tags                    | ✓ (NEW) — `classifyReplayDrift` closed-vocabulary classifier.            |

**Verdict.** Adopter ergonomics are sufficient for ecosystem self-
sustainment. No outstanding blocker requires framework-side action;
remaining blockers (`POST_V1_STRATEGY.md §5`) are intentional design
decisions that adopters either work around or self-host.

### 1.2 Runtime interoperability

| Property                                                       | Status                                                              |
|---|---|
| Language-neutral hash spec                                     | ✓ — `canonical-json-hash.md`.                                            |
| Cross-runtime envelope vectors                                 | ✓ (EXPANDED) — 9 vectors, including deep-nesting + numeric-edge.         |
| Cross-runtime audit-record subset vectors                      | ✓ (NEW) — 2 vectors covering EXECUTE + REFUSE shapes.                    |
| Closed-enum parity specification                               | ✓ (NEW) — `MULTIRUNTIME_CONFORMANCE.md §4`.                              |
| Replay-equivalence semantics specification                     | ✓ (NEW) — `MULTIRUNTIME_CONFORMANCE.md §2`.                              |
| Wire-format break protocol                                     | ✓ (NEW) — `SEMVER_GOVERNANCE.md §6`.                                     |
| Reference non-Node implementation                              | ◯ — pending adopter commitment; framework provides spec + vectors.       |

**Verdict.** The substrate is ready for multi-runtime expansion. The
framework's commitment is the *spec*; runtime implementation is
opportunistic per `POST_V1_STRATEGY.md §8`.

### 1.3 Pack ecosystem maturity

| Property                                                       | Status                                                              |
|---|---|
| Lighthouse Packs across distinct domains (payments / KYC / deployments) | ✓ — 3 in-tree Packs at conformance parity.                       |
| Manifest validator covering npm-convention shape               | ✓ — `validatePackManifest` (20 tests).                                   |
| Trust primitives (fingerprint + signature)                     | ✓ — `verifyPackTrust` (19 tests).                                        |
| Pack-health scoring primitive                                  | ✓ (NEW) — `scorePackHealth` (9 tests).                                   |
| Pack quality tier definition                                   | ✓ — `quality-scoring.md` (Bronze/Silver/Gold).                          |
| Pack-ecosystem health model                                    | ✓ (NEW) — `ECOSYSTEM_HEALTH_MODEL.md`.                                   |

**Verdict.** Ecosystem maturity is at the substrate level the framework
can provide. Further maturity (adopter-side curated indexes,
community-run quality reviews) is community-owned by design.

---

## §2 — Governance maturity

### 2.1 Semver discipline

| Property                                                       | Status                                                              |
|---|---|
| Per-surface tier classification                                | ✓ — `V1_FREEZE_MATRIX.md` (now §1–§29).                                |
| Replay-classification gate                                     | ✓ — `replay-classify` invariant in CI.                                  |
| Public-surface diff tooling                                    | ✓ — `scripts/check-freeze-matrix.ts`.                                   |
| Type-snapshot tests                                            | ✓ — per-package `api-surface.test.ts`.                                  |
| Semver decision tree                                           | ✓ (NEW) — `SEMVER_GOVERNANCE.md §2`.                                    |
| Coordinated MAJOR procedure                                    | ✓ (NEW) — `SEMVER_GOVERNANCE.md §6`.                                    |
| Hotfix lane definition                                         | ✓ (NEW) — `SEMVER_GOVERNANCE.md §12`.                                   |
| Reviewer checklist                                             | ✓ (NEW) — `SEMVER_GOVERNANCE.md §13`.                                   |

**Verdict.** Semver discipline is now mechanically enforceable. The
matrix + the script + the decision tree mean a reviewer cannot
accidentally land a MAJOR as a MINOR.

### 2.2 Extension governance

| Property                                                       | Status                                                              |
|---|---|
| Extension philosophy codified                                  | ✓ (NEW) — `EXTENSION_POLICY.md §1`.                                     |
| Categories of allowed extension                                | ✓ (NEW) — `EXTENSION_POLICY.md §2`.                                     |
| ADR template + criteria                                        | ✓ (NEW) — `EXTENSION_POLICY.md §3`.                                     |
| Experimental-surface policy                                    | ✓ (NEW) — `EXTENSION_POLICY.md §4`.                                     |
| Deprecation lifecycle rules                                    | ✓ (NEW) — `EXTENSION_POLICY.md §5`.                                     |
| Compatibility-guarantee matrix                                 | ✓ (NEW) — `EXTENSION_POLICY.md §6`.                                     |
| Out-of-scope list                                              | ✓ (NEW) — `EXTENSION_POLICY.md §9`.                                     |
| Post-v1 extension discipline ADR                               | ✓ (NEW) — `ADR-116`.                                                    |

**Verdict.** Extension governance is now explicit and durable. ADR-116
codifies the four operating rules; ecosystem-side ambiguity is
minimised.

### 2.3 Replay longevity confidence

| Property                                                       | Status                                                              |
|---|---|
| AuditRecord schema additivity across minor versions            | ✓ — v1/v2/v3/v4 readable side-by-side; pinned by tests.                 |
| Canonical-JSON algorithm pinned                                | ✓ — `canonical-json-hash.md` + golden vectors.                          |
| `intentHash` excludes `createdAt`                              | ✓ — pinned by invariant tests.                                          |
| `auditHash` excludes signature & self                          | ✓ — pinned by `verifyAuditRecord`.                                       |
| Replay-drift detection over years-old samples                  | ✓ (NEW) — `classifyReplayDrift`.                                         |
| Replay-integrity check (audit + envelope hash)                 | ✓ — `replayWithIntegrity`.                                              |
| Cross-runtime replay-equivalence requirement                   | ✓ (NEW) — `MULTIRUNTIME_CONFORMANCE.md §2`.                              |

**Verdict.** Replay longevity is enforceable. The substrate guarantees
that audit rows written today replay-classify as `IDENTICAL` or
`BASIS_ONLY` against any later kernel that honours the semver rule.

---

## §3 — Operational intelligence

### 3.1 Observability maturity

| Property                                                       | Status                                                              |
|---|---|
| OTLP-shaped sinks for metrics / learning / audit-spans         | ✓ — `@adjudicate/observability`.                                        |
| Stable `SEMCONV` namespace                                     | ✓ — 16 attributes, all `adjudicate.*`.                                  |
| Adapter-loop trace events                                      | ✓ — `TraceSink` lifecycle (v0.7).                                       |
| Real-time audit event substrate                                | ✓ — `AuditEventBus` (v0.7, evidence-gated).                              |
| Ecosystem-telemetry aggregator                                 | ✓ (NEW) — `createEcosystemTelemetry` (opt-in, local-first).              |
| Local-first ecosystem snapshots                                | ✓ (NEW) — `serializeEcosystemSnapshot`.                                   |

**Verdict.** Observability surface is comprehensive at the substrate
level. Adopter-side dashboards remain adopter-owned per
`OPERATOR_GUIDE.md §9`.

### 3.2 Anomaly-detection quality

| Property                                                       | Status                                                              |
|---|---|
| Replay-failure classification (closed taxonomy)                | ✓ (NEW) — `ReplayFailureClass`.                                          |
| Replay-drift trend classification                              | ✓ (NEW) — `ReplayDriftClass`.                                            |
| Kill-switch stability classification                           | ✓ (NEW) — `KillSwitchStabilityClass`.                                    |
| Supersession-chain reconstruction                              | ✓ (NEW) — `buildSupersessionChains`.                                     |
| Operational incident taxonomy                                  | ✓ (NEW) — `OperationalIncidentClass` (14 closed classes).                |
| Analyzer triage outcome taxonomy                               | ✓ (NEW) — `AnalyzerTriageOutcome`.                                       |
| Cardinality bounding on every aggregator                       | ✓ (NEW) — `BoundedCounter` with `__overflow__` bucket.                   |

**Verdict.** Anomaly-detection primitives are deterministic, closed-
vocabulary, and composable. Adopters can build runbooks atop them
without re-implementing the taxonomy.

### 3.3 Operator ergonomics

| Property                                                       | Status                                                              |
|---|---|
| Refusal-message localization                                   | ✓ — `RefusalMessages` injection point.                                  |
| Decision-narration registry                                    | ✓ — `explainRecord` + `mergeExplanationRegistries`.                      |
| Replay-report narration                                        | ✓ — `explainReplayReport` (3 formats).                                  |
| Supersession-chain narration                                   | ✓ — `narrateSupersession` (within `explainRecord`).                      |
| Kill-switch timeline summary                                   | ✓ (NEW) — `analyzeKillSwitchTimeline` + headline.                        |
| Pack-health one-line summary                                   | ✓ (NEW) — `explainPackHealth`.                                           |
| Operator guide                                                 | ✓ (NEW) — `OPERATOR_GUIDE.md` (13 sections, runbook-quality).            |

**Verdict.** Operator ergonomics are at the level the framework
substrate is responsible for. Per-deployment runbook depth is
adopter-owned (the framework provides the primitives + the guide).

---

## §4 — Long-term sustainability

### 4.1 Maintenance burden assessment

| Property                                                       | Status                                                              |
|---|---|
| Test count                                                     | 1084 passing (+62 over v1.0-RC).                                         |
| Test growth rate                                               | Bounded by additive primitives.                                          |
| Public-surface count                                           | 477 exports across 18 packages, all classified.                          |
| Freeze-matrix completeness                                     | §1–§28 (RC) + §29 (post-v1 additions); enforced by CI.                  |
| ADR count                                                      | 116 (was 115 at v1.0-RC).                                                |
| External dependencies count                                    | Unchanged (no new runtime deps in post-v1 additions).                    |
| Cross-package import cycles                                    | None (verified by `tsc --noEmit`).                                       |

**Verdict.** Maintenance burden grew modestly. Every addition is opt-
in, pure, and tested. The framework's maintainer-time cost over the
v1 lifetime scales with adopter pull, not with framework-team
ambition.

### 4.2 Conceptual simplicity assessment

| Property                                                       | Status                                                              |
|---|---|
| `Decision` algebra still six closed kinds                      | ✓                                                                       |
| `Taint` still three lattice points                             | ✓                                                                       |
| `RefusalKind` still six categories                             | ✓                                                                       |
| `BasisCategory` still eleven categories                        | ✓                                                                       |
| Guard evaluation order still `state → taint → auth → business` | ✓                                                                       |
| Fail-closed default unchanged                                  | ✓                                                                       |
| `adjudicate()` still synchronous and pure                      | ✓                                                                       |
| `IntentEnvelope v2` wire format unchanged                      | ✓                                                                       |
| `AuditRecord v4` schema unchanged                              | ✓                                                                       |
| New primitives outside kernel hot path                         | ✓ (all new primitives operate on AuditRecord/ReplayReport, not in-loop)  |

**Verdict.** Conceptual simplicity preserved. The kernel did not grow;
no new core type, no new core invariant. New primitives extend the
analytical surface only.

### 4.3 Ecosystem risk analysis

The following ecosystem-side risks have been identified and mitigated
or accepted. See [`LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md)
for the durable register.

| Risk                                                           | Mitigation                                                          |
|---|---|
| Marketplace-style centralisation pressure                      | Declined permanently (`EXTENSION_POLICY.md §9`).                          |
| Framework-side trust CA                                        | Declined permanently (adopter-controlled per `ECOSYSTEM_HEALTH_MODEL.md`).|
| Plugin-host / dynamic mutation                                 | Declined permanently (would break determinism per ADR-116).              |
| Wire-format churn                                              | Mitigated by coordinated MAJOR procedure (`SEMVER_GOVERNANCE.md §6`).    |
| Replay-drift in third-party Packs                              | Mitigated by `classifyReplayDrift` + adopter CI gates.                   |
| Pack fingerprint-spoofing                                      | Mitigated by signature verification (adopter-controlled keys).           |
| Closed-enum widening pressure                                  | Mitigated by ADR-116 (closed vocabularies stay closed).                  |
| Stale Pack discovery                                           | Mitigated by `scorePackHealth` + npm semver discipline.                  |
| Provider-adapter SDK churn                                     | Mitigated by adapter-core extraction (ADR-113); thin shims.              |
| Audit-postgres schema growth                                   | Mitigated by additive-only migrations; `forward only`.                   |

**Verdict.** Ecosystem risks are bounded. No mitigation depends on
framework-side service uptime; every primitive runs in-process.

---

## §5 — Permanently frozen invariants

The framework will not change any of the following within the v1 line.
Each is load-bearing for replay, audit, trust, determinism, or
ecosystem coherence.

| # | Invariant                                                          | Why frozen                                                                                 |
|---|---|---|
| 1 | `Decision` algebra (6 closed kinds)                                | Replay safety + ecosystem coherence. Re-shaping breaks every Pack.                          |
| 2 | `Taint` lattice (`SYSTEM > TRUSTED > UNTRUSTED`)                   | Participates in `intentHash`; reorder breaks the canonical hash.                            |
| 3 | `RefusalKind` enum (6 categories)                                  | Adopter-facing UX surfaces depend on the closed set.                                        |
| 4 | `BasisCategory` set (11 categories)                                | Pack-author analyzer + conformance harness depends on closed category-level set.            |
| 5 | Guard evaluation order (`state → taint → auth → business → default`) | Security assumptions of every Pack depend on this order.                                 |
| 6 | Fail-closed default (throw → `kernel.GUARD_PANIC` SECURITY REFUSE) | Defence in depth; relaxing would silently weaken every Pack.                                |
| 7 | Determinism on `adjudicate()` (no clock, no RNG, no I/O)           | Replay invariant; tests pin byte-identical re-emission.                                     |
| 8 | `intentHash` recipe (RFC 8785 JCS over the v2 subset)              | Wire-format; multi-runtime equivalence; ledger dedup.                                       |
| 9 | `auditHash` recipe (canonical JSON over record minus `auditHash + signature`) | Tamper detection; pinned by `verifyAuditRecord`.                                     |
| 10 | `AuditRecord` schema additivity (across minor versions)            | Multi-version readers; replay-classify across schema epochs.                                 |
| 11 | Pack isolation (`installPack` freezes; no mutation surface)        | Trust model; ecosystem coherence.                                                            |
| 12 | Adopter-controlled deps (clock, ledger, sinks via `deps`)          | Determinism; tenancy isolation; air-gappable substrate.                                      |
| 13 | `ProviderBridge<H>` shape (three methods, opaque history)          | Provider neutrality (`MULTIRUNTIME_CONFORMANCE.md §10`).                                    |
| 14 | Wire-format equivalence across multi-runtime implementations       | Ecosystem-wide replay; cross-language audit verification.                                    |
| 15 | `IntegrityFailure.kind` (3 closed failure modes)                   | Replay-integrity dashboards; closed monitoring surface.                                      |
| 16 | `ReplayMismatchKind` (3 axes)                                      | Semver enforcement gate.                                                                     |
| 17 | `EcosystemTelemetrySnapshot.schemaVersion` pinned at `1`           | Adopter snapshot consumers stable across MINORs.                                             |
| 18 | `KILL_SWITCH_EVENT_SOURCES` (5 closed sources)                     | Operational dashboards; closed cardinality.                                                  |
| 19 | `ReplayFailureClass` (6 closed taxonomy entries)                   | Cross-Pack incident triage vocabulary.                                                       |
| 20 | `OperationalIncidentClass` (14 closed taxonomy entries)            | Cross-deployment runbook vocabulary.                                                         |

Any change to any of these is a MAJOR governed by
[`SEMVER_GOVERNANCE.md §6`](./SEMVER_GOVERNANCE.md), with multi-
runtime co-release coordination where wire-format-adjacent.

---

## §6 — Outstanding work

The post-v1 audit identified no new outstanding work beyond what was
already on the priority lists in `PROJECT_STATUS_AND_NEXT_STEPS.md`:

1. **Adopter-evidence cleanup** (priority 1 from RC):
   - Real-world kill-switch v2 propagation latency.
   - Real-world `AuditEventBus` WebSocket fan-out throughput.
2. **Console real-time tail migration** (adopter-side).
3. **End-to-end "restart mid-flow" integration test** (adopter-side).
4. **Pack registry indexer** (community-driven if needed).
5. **Sigstore / OIDC / Rekor integration** (adopter-driven).

Nothing on this list blocks the framework from being declared post-v1
stable. The first two are *evidence-gated*; the others are *adopter-
driven*.

---

## §7 — Quantitative summary

| Metric                                                         | v1.0-RC | Post-v1   | Δ        |
|---|---|---|---|
| Tests passing                                                  | 1022    | 1084      | +62       |
| Tests skipped                                                  | 1       | 1         | 0         |
| Tests failing                                                  | 0       | 0         | 0         |
| Public packages                                                | 18      | 18        | 0         |
| ADRs                                                           | 115     | 116       | +1        |
| Cross-runtime vectors                                          | 6       | 11        | +5        |
| Closed-enum dimensions                                         | 13      | 17        | +4*       |
| Normative spec documents                                       | 7       | 10        | +3        |
| Post-v1 governance documents                                   | 0       | 6         | +6        |
| Public exports                                                 | 451     | 477       | +26       |
| Surfaces flagged as `evidence-gated`                           | 4       | 4         | 0         |
| Surfaces flagged as `deprecation-target`                       | 3       | 3         | 0         |
| Surfaces flagged as `frozen`                                   | majority | majority + new§29 rows | additive |

*The 4 new closed-enum dimensions are `ReplayFailureClass`,
`AnalyzerTriageOutcome`, `OperationalIncidentClass`,
`KillSwitchStabilityClass` — all opt-in, all closed, all additive in
MINOR.

---

## §8 — Final verdict

The framework has cleared the post-v1 transition:

- **Architecture is preserved.** No frozen surface was touched; every
  v1.0-RC invariant remains intact.
- **Governance is codified.** Six new normative documents + one ADR
  pin the framework's evolution rules for the v1 lifetime.
- **Ecosystem health is enforceable.** Five new pure primitives let
  adopters compose CI gates and operational dashboards without
  framework-side service dependencies.
- **Multi-runtime parity is specified.** The cross-runtime conformance
  spec + expanded vectors give non-Node implementations a complete
  contract.
- **Test confidence is up.** 1084 passing tests covering kernel,
  ledger, audit, replay, conformance, trust, telemetry, analytics,
  CLI, adapters, and Packs.

The framework is now operating as **disciplined post-v1 evolution
infrastructure**. The substrate is stable enough to be relied on for
the v1 lifetime, and the governance discipline is mechanical enough
that the substrate's stability does not depend on any one
maintainer's vigilance.

---

## §9 — Recommended next reviewer focus

For the reviewer cutting the v1.1 changeset:

1. Run `pnpm rc:check` against this branch; expect green.
2. Inspect the §29 freeze-matrix additions; verify alignment with
   actual exports via `pnpm tsx scripts/check-freeze-matrix.ts`.
3. Re-read [`SEMVER_GOVERNANCE.md §3`](./SEMVER_GOVERNANCE.md) before
   landing any further public-surface change.
4. Read [`LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md)
   §§2–9 to internalise the durable pressure-point register before
   responding to feature requests.
5. Apply ADR-116's four operating rules ("evidence before code,"
   "closed vocabularies stay closed," "wire formats are append-only,"
   "ADR gate on architectural change") to every PR.

The framework's value to adopters is *predictability of evolution
over years*. This audit confirms the substrate is positioned to
deliver that for the v1 lifetime.
