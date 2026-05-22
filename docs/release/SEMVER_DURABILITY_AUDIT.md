# Long-horizon semver durability audit

> **Status.** Normative for the v1 line. Evaluates whether the current
> freeze boundaries remain sustainable over 3-, 5-, and 10-year
> horizons. Identifies pressure points, frozen-surface risk zones,
> future extension pressure, and replay archival scaling risks.
>
> Companion to [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md) (the
> contract being audited),
> [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md) (the process that
> protects it), and
> [`docs/architecture/LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md)
> (the architectural pressure points). This document focuses on
> *semver durability*, not architectural durability.
>
> The audit is not a planning document. It is a *map of the strain
> points* the framework will eventually encounter. No item is
> scheduled work; each is annotated with the *evidence that would
> trigger response*.

---

## 1. Method

Each candidate pressure point is annotated:

| Annotation | Question |
|---|---|
| **Horizon** | When does this start mattering? (3y / 5y / 10y) |
| **Severity** | If unresolved, what is lost? (operator-burden / adopter-cost / replay-break / project-credibility) |
| **Trigger** | What signal indicates response is needed? |
| **Response class** | (additive / coordinated-MAJOR / deprecation / no-op) |

The headline metric: a healthy v1 line accumulates **zero** unplanned
MAJOR boundaries. Every MAJOR is anticipated, evidence-triggered, and
deferred until evidence is in.

---

## 2. Wire-format pressure points

### 2.1 IntentEnvelope v2 → v3

- **Horizon**: 5–7 years.
- **Severity**: replay-break + project-credibility (every existing
  envelope changes shape).
- **Trigger**: a class of envelope is needed that v2 cannot
  represent. Candidates discussed in
  [`LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md):
  - opaque payload encryption;
  - multi-party signatures;
  - explicit provenance chain for multi-LLM compositions.
- **Response class**: coordinated MAJOR. Requires new schema, new
  golden vectors, new replay-shim from v2.
- **Current pressure level**: low. v2 has shipped without significant
  field requests since release.

### 2.2 AuditRecord v4 → v5

- **Horizon**: 3–5 years.
- **Severity**: additive (v4 readers continue to read v5).
- **Trigger**: a new attestation kind (e.g., compute-attested) is
  required for compliance.
- **Response class**: additive MINOR with optional fields. Same
  discipline as v1 → v2 → v3 → v4.
- **Current pressure level**: low. v4 fields cover SOC 2 + GDPR +
  PCI-DSS requirements at typical compliance scope.

### 2.3 Canonical-JSON algorithm

- **Horizon**: 10+ years.
- **Severity**: catastrophic if changed (every audit record re-hashes).
- **Trigger**: a JavaScript / ECMAScript change that breaks one of:
  ES2015 number serialisation, UTF-8 passthrough, undefined omission,
  UTF-16 code-unit sort.
- **Response class**: coordinated MAJOR with new algorithm version
  (v2 → v3). Both algorithms ship side-by-side; new records use v3,
  old records replay with v2.
- **Current pressure level**: zero. ECMAScript JSON has been stable
  since 2015; no signal of upcoming change.

### 2.4 Closed enum widening

#### 2.4.1 `DecisionKind`

- **Horizon**: never (constitutional).
- **Severity**: catastrophic; the closed algebra is the framework's
  defining property.
- **Trigger**: a *new* governance outcome is identified that none of
  six existing kinds can encode. The bar is very high.
- **Response class**: only via a v2.0 MAJOR with explicit invariant
  amendment ADR.

#### 2.4.2 `RefusalKind`

- **Horizon**: 3–5 years.
- **Severity**: medium; refusal classifications can refine.
- **Trigger**: an adopter incident demonstrates the four kinds
  (`SECURITY`, `BUSINESS_RULE`, `AUTH`, `STATE`) confuse operators.
- **Response class**: additive MINOR (new kind) with backwards-
  compatible reader.

#### 2.4.3 `Taint`

- **Horizon**: never (constitutional).
- **Severity**: catastrophic; the lattice defines zero-trust.
- **Trigger**: only a fundamental change to the trust model.
- **Response class**: only via v2.0 MAJOR.

#### 2.4.4 `BasisCategory`

- **Horizon**: 5–10 years.
- **Severity**: medium; new categories may emerge.
- **Trigger**: an analyzer or conformance check requires a category
  none of the eleven existing supplies.
- **Response class**: MINOR for additive; MAJOR for rename or
  removal.

### 2.5 `INTENT_ENVELOPE_VERSION` increment

- **Horizon**: tied to §2.1.
- **Severity**: high (audit-postgres replay path needs the new
  branch).
- **Trigger**: same as §2.1.
- **Response class**: coordinated MAJOR.

---

## 3. API surface pressure points

### 3.1 `@adjudicate/core` exports

The freeze matrix lists ~80 exported identifiers. Pressure points:

- **`@experimental` primitives** (`createConfirmGuard`,
  `createEscalateGuard`, `createIdempotencyGuard`,
  `createRewriteGuard`): promotion to `frozen` is the natural path.
  Promotion is MINOR per
  [`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md) §4.
  - **Horizon**: 1–2 years.
  - **Trigger**: stable shape across two MINORs + one production
    adopter.

- **`@deprecated` markers**: removal is a calendar event (≥2 MAJORs
  out per [`deprecations.md`](./deprecations.md)).
  - **Horizon**: per-deprecation calendar.
  - **Trigger**: calendar date elapses.

### 3.2 Subpath export stability

- **`@adjudicate/core/kernel`** and **`@adjudicate/core/llm`**: the
  subpath split is the contract for adopters who want kernel without
  LLM types or vice versa.
- **Horizon**: indefinite.
- **Pressure**: none known. The split has been stable since v0.5.

### 3.3 Adapter-core `ProviderBridge<H>`

- **Horizon**: 3–5 years.
- **Severity**: low (one more adapter is < 200 lines).
- **Pressure**: a new provider's API does not fit the bridge shape.
- **Response**: MINOR addition to the bridge interface; existing
  adapters unaffected (the addition is optional).

---

## 4. Semantic-convention pressure points

### 4.1 SEMCONV vocabulary

- **Horizon**: 3–5 years.
- **Severity**: high (operator dashboards depend on keys).
- **Pressure**: upstream OpenTelemetry SEMCONV evolves; the framework's
  keys diverge from upstream.
- **Response**: the framework's SEMCONV is *frozen vocabulary* per
  [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
  §8. Adopters who want upstream alignment translate at their
  collector. The framework does not chase upstream.

### 4.2 Basis-code vocabulary

- **Horizon**: 5–10 years.
- **Severity**: medium.
- **Pressure**: new categories or codes are needed.
- **Response**: additive MINOR. Per-Pack basis codes are already
  permitted via `pack.basisCodes`; kernel-level additions are
  scheduled events.

### 4.3 Refusal codes

- **Horizon**: 5–10 years.
- **Severity**: medium.
- **Pressure**: `KERNEL_REFUSAL_CODES` widens.
- **Response**: additive MINOR.

---

## 5. Replay archival scaling pressure points

### 5.1 Longevity-corpus growth

- **Horizon**: 5–10 years.
- **Severity**: low (corpus is JSON, small).
- **Pressure**: one fixture per release, with the corpus growing.
  After 10 years × 4 releases/year = 40 fixtures.
- **Response**: no action. JSON parse cost for 40 fixtures is
  negligible.

### 5.2 Cross-runtime vector growth

- **Horizon**: 5–10 years.
- **Severity**: low.
- **Pressure**: each envelope/audit-record shape variation adds a
  vector. After 5 years, ~30 vectors expected.
- **Response**: organise by category if needed; otherwise no action.

### 5.3 Audit-postgres partition count

- **Horizon**: 3–5 years per adopter.
- **Severity**: adopter-side operational concern.
- **Pressure**: monthly partitions accumulate. After 5 years × 12 =
  60 partitions per table.
- **Response**: partition archival is an adopter concern. The
  framework's migration discipline ensures partitions remain
  queryable.

### 5.4 Audit-record version branching

- **Horizon**: 10+ years.
- **Severity**: medium.
- **Pressure**: after multiple version increments, the reader logic
  branches on each version. After v6 or v7, the branching becomes
  cognitively heavy.
- **Response**: at v5 or v6, consider a discriminated-union helper
  that centralises the branching. Implementation detail; no contract
  change.

---

## 6. Operational sustainability pressure points

### 6.1 Maintainer-curve at year 5–7

- **Horizon**: 5–7 years.
- **Severity**: institutional.
- **Pressure**: original authors fully transition out; institutional
  memory rests on encoded artefacts.
- **Response**: the
  [`MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md),
  [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md),
  and [`INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md)
  are the encoding. Their adequacy is annually reviewed.

### 6.2 CI provider drift

- **Horizon**: 3–5 years.
- **Severity**: medium (release pipeline reconstitution).
- **Pressure**: GitHub Actions deprecates an action, npm changes its
  authentication scheme, Sigstore evolves.
- **Response**: per-event update. The CI workflows are small enough
  to port to another provider in < 1 day per
  [`ECOSYSTEM_ANTI_FRAGILITY.md`](../architecture/ECOSYSTEM_ANTI_FRAGILITY.md)
  §9.

### 6.3 Dependency-update fatigue

- **Horizon**: ongoing.
- **Severity**: low (dependency tree is short).
- **Pressure**: dependabot or equivalent generates noise.
- **Response**: batch dependency updates into quarterly review.
  Critical security updates land on demand.

---

## 7. Frozen-surface risk zones

A *risk zone* is a part of the freeze matrix where pressure to
break the freeze is non-zero. The current zones:

### 7.1 `Decision.metadata` perennial proposal

- **Pressure source**: contributors wanting to attach diagnostic
  context to decisions.
- **Risk**: the freeze is violated under sustained pressure.
- **Mitigation**: documented in
  [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
  §2; the answer is "use `AuditRecord` metadata".
- **Watch level**: HIGH. Expect a new proposal every 6–12 months.

### 7.2 `confidence` field

- **Pressure source**: probabilistic decision frameworks suggesting
  the kernel return a confidence score.
- **Risk**: the framework becomes opinionated about probabilistic
  semantics it does not own.
- **Mitigation**: ADR-104 rejection rationale.
- **Watch level**: MEDIUM.

### 7.3 YAML/JSON Pack DSL

- **Pressure source**: contributors wanting to author Packs without
  TypeScript.
- **Risk**: parser surface adds to the trust boundary.
- **Mitigation**: `GuardMetadata` is the declarative layer; TypeScript
  is the substrate.
- **Watch level**: MEDIUM.

### 7.4 Framework-hosted registry

- **Pressure source**: ecosystem coordination convenience.
- **Risk**: centralises trust; ecosystem-health model collapses.
- **Mitigation**: ADR + ECOSYSTEM_HEALTH_MODEL §2.
- **Watch level**: LOW (settled doctrine).

### 7.5 AI-driven governance automation

- **Pressure source**: novelty.
- **Risk**: non-determinism in the trust path.
- **Mitigation**: forbidden by
  [`GOVERNANCE_PLAYBOOK.md`](./GOVERNANCE_PLAYBOOK.md) §15.
- **Watch level**: LOW.

---

## 8. Future extension pressure landscape

The most likely additive extensions over the next 5 years (in
descending probability):

1. **More analyzer diagnostics** (`AJD-2NN`). Each is MINOR, additive.
2. **More conformance checks** (`AC-NNN`). Each is MINOR, additive.
3. **More codemods** (`@adjudicate/migrate`). Each ships with a
   deprecation.
4. **More basis codes**. Per-Pack additions are adopter-side; kernel
   additions are scheduled MINOR.
5. **More observability attributes**. Frozen vocabulary; additions
   are MINOR.
6. **More Pack examples**. Not part of the freeze surface; can
   evolve freely.

Each is well-trodden additive evolution. None should cause unplanned
MAJOR.

---

## 9. The 10-year compatibility matrix

| Dimension | At year 10, can adopters... |
|---|---|
| Install v1.0 | Yes (npm versions never expire). |
| Install v1.x for any x in [0, current] | Yes. |
| Replay v1.0 records on v1.x kernel | Yes (longevity corpus enforces). |
| Replay v1.0 records on v2.0 kernel | Yes if replay-shim ships. |
| Read v1 envelopes via v1.x readers | Yes. |
| Read v1 audit records via v1.x readers | Yes (additive schema). |
| Build new Packs against v1.x types | Yes. |
| Verify v1.0 audit-hashes on v1.x | Yes (verifyAuditRecord is pure). |
| Migrate adopter code from v1.0 → v1.x | Yes (codemods for each deprecation). |
| Migrate v1.x → v2.0 | Yes via UPGRADE-PLAYBOOK. |

---

## 10. The semver durability commitment

Restated for clarity:

- **Across MINOR**: zero replay drift; additive only; deprecation
  calendar honoured.
- **Across MAJOR**: ≥ 99% IDENTICAL/BASIS_ONLY; coordinated multi-
  runtime release; replay-shim documented.
- **Across line (v1 → v2 → v3)**: ≥ 95% IDENTICAL/BASIS_ONLY on the
  unchanged sub-corpus; each MAJOR has its predecessor's records
  classifiable.

The audit's main finding: the framework's semver discipline is
*structurally* designed to satisfy these commitments. The risk is
not the discipline; the risk is *abandonment of the discipline*
under contributor pressure.

The mitigation is process: every PR runs the
[`CHANGE_REVIEW_CHECKLIST.md`](./CHANGE_REVIEW_CHECKLIST.md); every
replay-impacting PR runs the
[`REPLAY_RISK_REVIEW.md`](./REPLAY_RISK_REVIEW.md); every annual
review walks this document.

---

## 11. Watch list for the next annual audit

Items to specifically re-evaluate at the next annual audit:

- [ ] Has `@noble/hashes` had a release in the past year?
- [ ] Has Node.js released a new LTS? Is Node 20 EOL?
- [ ] Has any third-party runtime appeared?
- [ ] Has the `Decision.metadata` proposal recurred?
- [ ] Has the experimental-primitive promotion criterion been met
      for any of the four?
- [ ] Has the kill-switch v2 `pollMs` default been adjusted with
      adopter evidence?
- [ ] Has the `verifyParkedHash` mode flipped to `strict`?
- [ ] Have any deprecation calendar entries elapsed?

---

## 12. The summary line

The freeze boundaries documented in
[`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md) are sustainable for
the next 5–7 years without significant strain. Strain begins at
year 5–7 from external ecosystem pressure (Node LTS turnover,
SEMCONV upstream drift, provider sunsets) rather than from internal
contradictions. The framework is *designed for the strain*; the
strain is anticipated and the response is documented.

Re-audit at the next annual review.
