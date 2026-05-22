# Long-term stewardship report

> **Status.** Capstone artefact of the post-v1 stewardship phase.
> Certifies the framework's institutional durability, replay
> longevity, ecosystem resilience, governance sustainability, and
> operational survivability. Re-issued annually per
> [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §16.
>
> Initial issue: 2026-05-21 (audit cycle 1).
>
> Companion to every document under `docs/architecture/`,
> `docs/release/`, `docs/ops/`, `docs/specs/`, and
> `docs/pack-ecosystem/`. Where this report disagrees with any
> companion, the companion is authoritative — this report summarises;
> the others govern.
>
> Audience: a maintainer (or auditor) reading this 5–10 years from
> issue date to assess whether the framework is meeting its
> stewardship commitments.

---

## 1. Executive certification

The framework is **fit for long-term institutional stewardship** as
of audit cycle 1 (2026-05-21).

Evidence:

- **1110 tests passing** across the monorepo (1084 baseline + 26
  new stewardship-phase additions); 1 skipped (audit-postgres
  live-DB); 0 failing.
- **16 ADRs** documenting every architectural decision (ADR-101..ADR-116).
- **Eleven constitutional invariants** documented with rationale
  in [`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md);
  each pinned by a property test, conformance check, or ESLint rule.
- **Eleven stewardship documents** (this one + 10 others)
  preserving engineering intent for future maintainers.
- **Long-range replay corpus** in
  [`docs/specs/replay-longevity-corpus.json`](../specs/replay-longevity-corpus.json)
  with 5 fixtures and the
  [`packages/audit/tests/replay-longevity.test.ts`](../../packages/audit/tests/replay-longevity.test.ts)
  gate enforcing across-version IDENTICAL replay.
- **Operational survivability primitives** shipped: deterministic
  snapshots, incident bundles, operator-handoff exports
  ([`packages/audit/src/operational-snapshot.ts`](../../packages/audit/src/operational-snapshot.ts)).

No critical risks open; two non-critical institutional risks
documented and tracked.

---

## 2. Institutional durability

### 2.1 Maintainership survivability

**Status: GREEN.**

The framework can be maintained by one person after a transition
period of <90 minutes (per the
[`MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md) §2 onboarding
sequence). The maintainer's responsibilities are codified to three
items
([`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §1):

1. Reject changes that violate constitutional invariants.
2. Approve only additive evolution.
3. Keep releases cuttable.

Annual maintainer cost projected at **4–6 days/year** beyond
year 2 per
[`MAINTENANCE_COST_AUDIT.md`](./MAINTENANCE_COST_AUDIT.md) §10.

### 2.2 Governance continuity

**Status: GREEN.**

Governance discipline is encoded in
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md),
[`CHANGE_REVIEW_CHECKLIST.md`](../release/CHANGE_REVIEW_CHECKLIST.md),
[`REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md), and
[`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md). Decision
mechanics are mechanical, not editorial. Disputes resolve through
the decision tree, not through maintainer authority.

Maintainer turnover is anticipated and documented:
- §11 of GOVERNANCE_PLAYBOOK covers maintainer-absent operation;
- §12 covers lost release credentials;
- The annual bus-factor entries in
  [`docs/execution/decisions-log.md`](../execution/decisions-log.md)
  surface knowledge concentration before it becomes risk.

### 2.3 Operational knowledge preservation

**Status: GREEN.**

Operational knowledge is preserved in:

- [`OPERATOR_GUIDE.md`](../ops/OPERATOR_GUIDE.md) — health signals
  and triage.
- [`OPERATIONAL_ASSUMPTIONS.md`](../ops/OPERATIONAL_ASSUMPTIONS.md) — what
  the runtime assumes.
- [`FAILURE_MODE_CATALOG.md`](../ops/FAILURE_MODE_CATALOG.md) — known
  failure modes + responses.
- [`ECOSYSTEM_RECOVERY_PROCEDURES.md`](../ops/ECOSYSTEM_RECOVERY_PROCEDURES.md) — incident
  recovery procedures.
- [`docs/ops/runbooks/`](../ops/runbooks/) — per-incident playbooks.

These cover the deployment topology, health-signal interpretation,
incident response, and recovery in a way that does not require
original-author availability.

---

## 3. Replay longevity

### 3.1 Archival guarantees

**Status: GREEN.**

Replay is guaranteed under the longevity commitments documented in
[`REPLAY_LONGEVITY_MODEL.md`](../specs/REPLAY_LONGEVITY_MODEL.md)
§2:

- **Within a MINOR**: 100% IDENTICAL.
- **Within a MAJOR**: ≥ 99% IDENTICAL or BASIS_ONLY.
- **Across a MAJOR boundary**: ≥ 95% on unchanged sub-corpus.
- **Decade horizon**: ≥ 90% on unchanged sub-corpus.

Archival artefacts:

- Per-version git tags preserve all kernel source.
- `docs/specs/canonical-hash-vectors.json` preserves cross-runtime
  algorithm contract.
- `docs/specs/replay-longevity-corpus.json` preserves cross-version
  decision contract.
- `packages/core/tests/hash-golden-vectors.test.ts` and
  `packages/audit/tests/replay-longevity.test.ts` enforce at CI.

### 3.2 Compatibility confidence

**Status: GREEN.**

The framework's design assumes Node.js, ECMAScript JSON, and SHA-256
remain available indefinitely. Each can be replaced with a documented
recovery path:

- Node.js → any ES2015+ runtime that supports the same `JSON.stringify`
  semantics.
- ECMAScript JSON → re-implement canonicalisation per
  [`canonical-json-hash.md`](../specs/canonical-json-hash.md) spec.
- SHA-256 → swap `@noble/hashes` for any byte-stable equivalent;
  golden vectors are the arbiter.

### 3.3 Vector preservation discipline

**Status: GREEN.**

Two vector files anchor the cross-version and cross-runtime contracts:

- [`canonical-hash-vectors.json`](../specs/canonical-hash-vectors.json) — algorithm-level vectors.
- [`replay-longevity-corpus.json`](../specs/replay-longevity-corpus.json) — decision-level vectors.

The discipline (documented in REPLAY_LONGEVITY_MODEL §4.3 and
REPLAY_RISK_REVIEW §5): **extend, never mutate**. Every release adds
fixtures; no release deletes them.

---

## 4. Ecosystem resilience

### 4.1 Provider resilience

**Status: GREEN.**

Provider neutrality is constitutional
([`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md) §7).
The kernel imports no provider SDK. Provider sunset is an adapter-
package concern, not a framework concern. Adding a third adapter is
< 200 lines.

The two reference adapters (Anthropic, OpenAI) cover the dominant
providers as of 2026-05. Future providers ship through the same
seam.

### 4.2 Dependency resilience

**Status: GREEN.**

Per
[`ECOSYSTEM_ANTI_FRAGILITY.md`](./ECOSYSTEM_ANTI_FRAGILITY.md):

- The single load-bearing crypto dependency (`@noble/hashes`) is
  replaceable via the golden-vector contract.
- The reference infrastructure (Redis, Postgres) is behind
  interface seams; replacement is adopter-side.
- The release substrate (GitHub + npm + Sigstore) has documented
  fallback paths.
- The Node.js runtime pin is forward-compatible.

### 4.3 Trust-model resilience

**Status: GREEN.**

`verifyPackTrust` is pure and local
([`WHY_THE_INVARIANTS_EXIST.md`](./WHY_THE_INVARIANTS_EXIST.md) §12).
The framework does not host a CA, does not gate signing, and does
not depend on Sigstore for the trust path. Sigstore is additive
transparency; its disappearance does not affect framework operation.

---

## 5. Governance sustainability

### 5.1 Semver sustainability

**Status: GREEN.**

The semver-decision tree
([`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md) §2) is
mechanical. Edge cases land at ADR; ambiguity is resolved by
encoding, not editorial fiat.

The audit
([`SEMVER_DURABILITY_AUDIT.md`](../release/SEMVER_DURABILITY_AUDIT.md))
projects the current freeze boundaries are sustainable through year
5–7 without strain; strain begins from external ecosystem pressure
(Node LTS, SEMCONV upstream, provider sunsets), each with a
documented response.

### 5.2 Extension governance sustainability

**Status: GREEN.**

Three permanent extension rules
([`EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md) §1):

- Closed enums stay closed.
- Wire formats stay frozen.
- Public functions widen additively or not at all.

Future extension landscape is dominated by additive evolution
(more analyzers, more conformance checks, more codemods, more
basis codes); none requires breaking the rules.

### 5.3 Maintenance overhead sustainability

**Status: GREEN.**

[`MAINTENANCE_COST_AUDIT.md`](./MAINTENANCE_COST_AUDIT.md) §10
projects year-5+ maintenance at 4–6 days/year. Annual review +
per-PR review + per-release cuts are the only recurring
obligations.

---

## 6. Operational survivability

### 6.1 Degraded-mode operation

**Status: GREEN.**

[`FAILURE_MODE_CATALOG.md`](../ops/FAILURE_MODE_CATALOG.md)
documents 9 named failure modes across kernel, replay, kill-switch,
park/resume, Pack ecosystem, release pipeline, observability, and
cross-cutting maintainer-absent operation. Each has a degraded-mode
contract.

### 6.2 Incident survivability

**Status: GREEN.**

[`ECOSYSTEM_RECOVERY_PROCEDURES.md`](../ops/ECOSYSTEM_RECOVERY_PROCEDURES.md)
documents recovery procedures for 11 named scenarios. The annual
drill cadence keeps procedures fresh.

Operational primitives:

- `buildOperationalSnapshot` — deterministic point-in-time export.
- `buildIncidentBundle` — replayable incident package.
- `buildOperatorHandoff` — out-of-band handoff artefact.

Each is pure, deterministic, and JSON-portable
([`packages/audit/src/operational-snapshot.ts`](../../packages/audit/src/operational-snapshot.ts)).

### 6.3 Operator-turnover resilience

**Status: GREEN.**

The operator-handoff export captures deployment state in a
verifiable bundle. An incoming operator receives the bundle, runs
`verifyOperatorHandoff`, and inherits a known state.

[`OPERATOR_GUIDE.md`](../ops/OPERATOR_GUIDE.md) is sufficient to
operate the framework without original-author availability.

---

## 7. Permanently frozen surfaces

Future maintainers must NOT change the following without an explicit
constitutional amendment ADR (which has never been used in the v1
line and is expected to remain unused until v2.0):

### 7.1 Decision algebra

- The six `Decision.kind` values.
- The shape of each variant.
- No `metadata`, `confidence`, or extension field.

### 7.2 Closed enums

- `RefusalKind`: SECURITY / BUSINESS_RULE / AUTH / STATE.
- `Taint`: SYSTEM / TRUSTED / UNTRUSTED.
- `IntentActor.principal`: llm / user / system.
- `BasisCategory`: 11 values (state / auth / taint / ledger / schema
  / business / validation / kill / deadline / confirmation /
  kernel).

### 7.3 Wire format

- `IntentEnvelope v2` schema.
- `AuditRecord v4` schema (additive widening only).
- Canonical-JSON hash recipe (RFC 8785 JCS + SHA-256).
- The hash input subset: `{version, kind, payload, nonce, actor,
  taint}` — `createdAt` excluded.

### 7.4 Determinism

- `adjudicate()` is pure: no clock, no RNG, no I/O, no async, no
  global state.

### 7.5 Guard ordering

- Kernel guard sequence: `kill → schema → state → taint → auth →
  business → default`.

### 7.6 Fail-closed semantics

- Throwing guards become `SECURITY REFUSE` with
  `kernel.GUARD_PANIC`.
- Audit emission fails closed by default per ADR-102.

### 7.7 Pack isolation

- Packs cannot reach into each other's policy state through the
  kernel.

### 7.8 Trust verification semantics

- `verifyPackTrust` is pure and local; no network calls.

### 7.9 Audit immutability

- `AuditRecord` is a value; sinks append only.

### 7.10 Provider neutrality

- The kernel imports no provider SDK.

### 7.11 Semantic-convention stability

- SEMCONV keys are frozen vocabulary; renames are MAJOR.

These eleven properties are *constitutional*. The framework's
legitimacy rests on them.

---

## 8. Long-horizon risks

Two non-critical institutional risks remain open. Both are tracked
in [`INSTITUTIONAL_RISK_REGISTER.md`](./INSTITUTIONAL_RISK_REGISTER.md)
§8.

### 8.1 Release-credentials handover (risk 4.2)

- **Open**: the release process depends on NPM_TOKEN + GitHub admin
  held by individual maintainers. Handover is documented but not
  automated.
- **Mitigation discipline**:
  [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §12
  documents the recovery path including fork-to-new-scope.
- **Watch level**: ongoing.

### 8.2 Cross-runtime decision-equivalence vectors (risk 6.3)

- **Partial**: the cross-runtime hash vectors exist; the
  decision-equivalence vectors are sketched but not yet generated.
- **Trigger**: appearance of a third-party runtime implementation.
- **Mitigation**: [`POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md) §"Cross-
  runtime expansion" identifies the next investment.

Neither risk threatens the framework's core value proposition;
each is documented for the next maintainer's attention.

---

## 9. Test posture certification

As of 2026-05-21 audit cycle 1:

| Package | Tests | Status |
|---|---|---|
| `@adjudicate/core` | 376 | passing |
| `@adjudicate/audit` | 180 | passing (incl. 18 longevity + 8 snapshot) |
| `@adjudicate/audit-postgres` | 55 (+1 skipped) | passing |
| `@adjudicate/admin-sdk` | 70 | passing |
| `@adjudicate/conformance` | 57 | passing |
| `@adjudicate/runtime` | 44 | passing |
| `@adjudicate/adapter-core` | 36 | passing |
| `@adjudicate/cli` | 100 | passing |
| `@adjudicate/primitives` | 28 | passing |
| `@adjudicate/analyze` | 24 | passing |
| `@adjudicate/observability` | 20 | passing |
| `@adjudicate/anthropic` | 19 | passing |
| `@adjudicate/openai` | 12 | passing |
| `@adjudicate/pack-payments-pix` | 29 | passing |
| `@adjudicate/pack-identity-kyc` | 15 | passing |
| `@adjudicate/pack-deployments-approval` | 12 | passing |
| `@adjudicate/migrate` | 10 | passing |
| `@adjudicate/locales-pt-BR` | 4 | passing |
| `examples/vacation-approval` | 6 | passing |
| `examples/commerce-reference` | 9 | passing |
| `bench` | 4 | passing |
| **Total** | **1110 passing, 1 skipped, 0 failing** | |

26 net additions in this audit cycle (18 longevity + 8 operational
snapshot), all in `@adjudicate/audit`. No regressions in any other
package.

---

## 10. Documentation completeness

The stewardship documentation set:

| Document | Path | Purpose |
|---|---|---|
| Institutional risk register | [docs/architecture/INSTITUTIONAL_RISK_REGISTER.md](./INSTITUTIONAL_RISK_REGISTER.md) | Risk inventory + mitigation map |
| Why the invariants exist | [docs/architecture/WHY_THE_INVARIANTS_EXIST.md](./WHY_THE_INVARIANTS_EXIST.md) | Constitutional rationale |
| Long-term stewardship report | (this file) | Annual certification |
| Ecosystem anti-fragility | [docs/architecture/ECOSYSTEM_ANTI_FRAGILITY.md](./ECOSYSTEM_ANTI_FRAGILITY.md) | Dependency-failure response |
| Maintenance cost audit | [docs/architecture/MAINTENANCE_COST_AUDIT.md](./MAINTENANCE_COST_AUDIT.md) | Ongoing-burden tracking |
| Maintainer guide | [docs/ops/MAINTAINER_GUIDE.md](../ops/MAINTAINER_GUIDE.md) | Onboarding |
| Operational assumptions | [docs/ops/OPERATIONAL_ASSUMPTIONS.md](../ops/OPERATIONAL_ASSUMPTIONS.md) | Environmental contract |
| Failure mode catalogue | [docs/ops/FAILURE_MODE_CATALOG.md](../ops/FAILURE_MODE_CATALOG.md) | Incident taxonomy |
| Ecosystem recovery procedures | [docs/ops/ECOSYSTEM_RECOVERY_PROCEDURES.md](../ops/ECOSYSTEM_RECOVERY_PROCEDURES.md) | Per-scenario playbooks |
| Governance playbook | [docs/release/GOVERNANCE_PLAYBOOK.md](../release/GOVERNANCE_PLAYBOOK.md) | Maintainer process |
| Change review checklist | [docs/release/CHANGE_REVIEW_CHECKLIST.md](../release/CHANGE_REVIEW_CHECKLIST.md) | Per-PR gate |
| Replay risk review | [docs/release/REPLAY_RISK_REVIEW.md](../release/REPLAY_RISK_REVIEW.md) | Replay-impacting PR gate |
| Semver durability audit | [docs/release/SEMVER_DURABILITY_AUDIT.md](../release/SEMVER_DURABILITY_AUDIT.md) | 3/5/10-year horizon analysis |
| Replay longevity model | [docs/specs/REPLAY_LONGEVITY_MODEL.md](../specs/REPLAY_LONGEVITY_MODEL.md) | Replay commitment contract |

12 documents (11 stewardship-specific + this report). Each is
annual-review-touchable.

---

## 11. The framework's identity at year 1 of v1

After the stewardship phase:

- **The framework is a governance substrate, not a product.** Its
  job is to remain available, replayable, and auditable for years.
  It does not grow; it is preserved.
- **The maintainer's job is preservation, not invention.** New work
  is rare; rejection of constitutional violations is common.
- **The ecosystem is decentralised.** Packs ship under adopter
  scopes; trust is local; discovery is convention-based.
- **The substrate is portable.** A re-implementation in any future
  language is permitted by the spec; the framework's value does not
  require the Node reference runtime to survive forever.

This identity is the success criterion. Every annual review's
question is: is the framework still meeting it?

---

## 12. Next audit cycle

Scheduled: **2027-05-21**.

Required walks at next audit:

- [ ] `INSTITUTIONAL_RISK_REGISTER.md` — mitigation drift check.
- [ ] `OPERATIONAL_ASSUMPTIONS.md` — upstream health check.
- [ ] `ECOSYSTEM_ANTI_FRAGILITY.md` — dependency-tree audit.
- [ ] `MAINTENANCE_COST_AUDIT.md` §8 — decay watchlist.
- [ ] `SEMVER_DURABILITY_AUDIT.md` §11 — annual watch list.
- [ ] Longevity corpus — extend with v1.y fixtures, do not mutate.
- [ ] Bus-factor entries in `decisions-log.md` — record concentrations.
- [ ] Re-issue this report.

---

## 13. Sign-off

Audit cycle 1 (2026-05-21):

- **Maintainer**: post-v1 stewardship director.
- **Test posture verified**: 1110 passing, 1 skipped, 0 failing.
- **Invariants verified**: all 11 constitutional properties hold.
- **Open risks**: 2, both non-critical and documented.
- **Certification**: the framework is fit for long-term institutional
  stewardship and is expected to remain so through at least 2031-05.

The framework is governance infrastructure. It will remain
deterministic, replayable, auditable, understandable, semver-
disciplined, and operationally trustworthy for the decade ahead.

This is the commitment. The encoded artefacts are the mechanism.
