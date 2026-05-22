# Maintenance-cost audit

> **Status.** Normative for the post-v1 stewardship phase. Audits the
> framework's ongoing maintenance overhead, identifies low-value
> burden, and codifies what must NOT be simplified despite its
> appearance.
>
> Companion to
> [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
> (process discipline) and
> [`INSTITUTIONAL_RISK_REGISTER.md`](./INSTITUTIONAL_RISK_REGISTER.md)
> (what cannot be lost).
>
> The healthiest long-term infrastructure *gets simpler over time*.
> The framework is past its growth phase; ongoing maintenance should
> trend down, not up. This document is the map.

---

## 1. Posture

A post-v1 framework should accumulate *less* discretionary process,
not more. Every recurring obligation has to justify its cost in
adopter or maintainer value. This audit walks the current obligation
surface and tags each item:

- **load-bearing** — must keep; documented why.
- **discretionary** — can defer if maintainer time is constrained.
- **decay candidate** — can simplify or remove without value loss.

The audit is performed annually as part of the
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §16
review. Items that drift from "load-bearing" to "decay candidate"
are surfaced here.

---

## 2. Recurring obligations — current state

### 2.1 Annual reviews

| Item | Status | Cost | Why |
|---|---|---|---|
| `INSTITUTIONAL_RISK_REGISTER.md` annual walk | load-bearing | 1 day | Catches mitigation drift before incidents. |
| `OPERATIONAL_ASSUMPTIONS.md` annual walk | load-bearing | 1 day | Validates upstream still supports each assumption. |
| `ECOSYSTEM_ANTI_FRAGILITY.md` annual walk | load-bearing | 1 day | Dependency-tree health check. |
| Longevity test re-run + corpus extension | load-bearing | 0.5 day | Renews the 10-year promise. |
| `LONG_TERM_STEWARDSHIP_REPORT.md` re-issue | load-bearing | 0.5 day | Institutional continuity artefact. |
| Bus-factor entries in `decisions-log.md` | load-bearing | 0.25 day | Encodes the year's knowledge concentration. |

Annual obligation total: **~4 days/year**. Below this is institutional
neglect; above this is process bureaucracy.

### 2.2 Per-PR obligations

| Item | Status | Cost | Why |
|---|---|---|---|
| `CHANGE_REVIEW_CHECKLIST.md` application | load-bearing | 5–15 min | Mechanical safety gate. |
| `REPLAY_RISK_REVIEW.md` (when applicable) | load-bearing | 15–30 min | Replay drift is catastrophic. |
| Property-test suite confirmation | load-bearing | 1 min | Confirms invariants. |
| Changeset semver classification | load-bearing | 2 min | Adopter-visible. |
| Freeze-matrix update (if surface touched) | load-bearing | 5 min | Tracks the contract. |
| ADR (if architectural) | discretionary | 30 min | Skip for non-architectural changes. |
| `docs/execution/decisions-log.md` sign-in | discretionary | 1 min | Useful but not gating. |

Per-PR target: **5–15 minutes for routine PRs**. If a PR routinely
takes longer, the checklist is over-applied; revisit.

### 2.3 Per-release obligations

| Item | Status | Cost | Why |
|---|---|---|---|
| RC checks (`scripts/rc-checks.ts`) | load-bearing | 0 (CI) | Release gate. |
| CHANGELOG generation (changesets bot) | load-bearing | 0 (auto) | Adopter-visible. |
| Tag + announce | load-bearing | 5 min | Discoverability. |
| Sigstore attestation | discretionary | 0 (CI) | Additive transparency. |

Per-release target: **< 30 minutes** for patch/minor; **multi-week** for
MAJOR.

---

## 3. Areas with simplification headroom

### 3.1 `apps/console` polling-based audit tail

- **Current**: console polls `/audit` every 2s.
- **Available**: `AuditEventBus` + WebSocket bridge ships in v0.7.
- **Cost**: console maintenance is N concurrent polls; bus migration
  is a one-time effort with lower ongoing cost.
- **Recommendation**: low-priority opportunistic migration. Not
  blocking. See `PROJECT_STATUS_AND_NEXT_STEPS.md` §"Priority 2".

### 3.2 Two release workflows

- **Current**: `release.yml` + `release-candidate.yml` are distinct.
- **Could merge**: a single workflow with a `mode` input.
- **Why not merge**: distinct triggers, distinct permission scopes,
  distinct failure semantics. The duplication is *intentional* and
  documented.
- **Recommendation**: leave as-is. Not a decay candidate.

### 3.3 Per-package `tsconfig.json`

- **Current**: every package has its own `tsconfig.json`.
- **Could centralise**: a root tsconfig + package extends.
- **Why not centralise**: `pnpm` workspace package isolation; each
  package's `tsconfig` references its own dist output path; the
  current setup is already centralised through `tsconfig.base.json`.
- **Recommendation**: leave as-is.

### 3.4 `docs/architecture/V0.6-AUDIT-REPORT.md` + `V0.7-AUDIT-REPORT.md`

- **Current**: historical pre-v1 audit reports.
- **Status**: archival; not consulted in current operations.
- **Could remove**: once their content is fully encoded in newer docs.
- **Recommendation**: **keep**. They are institutional memory of how
  the framework reached v1. Future maintainers re-reading them learn
  the *trajectory*, not just the snapshot. Archival is cheap;
  deletion is irreversible.

### 3.5 `docs/execution/OVERNIGHT-RUN-SUMMARY.md`

- **Current**: artefact from a specific run.
- **Status**: archival.
- **Could remove**: yes; no ongoing reference.
- **Recommendation**: **keep**. Same logic as §3.4. Archival cost is
  near-zero.

### 3.6 Three pending changesets (`v0.5`, `v0.6`, `v0.7`)

- **Current**: three large changesets accumulated pre-v1.
- **Status**: pending; will fold into the v1.0 cut.
- **Recommendation**: leave as-is. The folding happens at v1.0 cut;
  pre-emptive consolidation provides no value.

---

## 4. Areas that look like overhead but are NOT

### 4.1 `docs/specs/replay-longevity-corpus.json`

- **Appearance**: another JSON fixture.
- **Reality**: the cross-version replay contract. Removal would lose
  the 10-year longevity property.
- **Discipline**: extend, never mutate. See
  [`REPLAY_LONGEVITY_MODEL.md`](../specs/REPLAY_LONGEVITY_MODEL.md) §4.3.

### 4.2 `packages/conformance/src/checks/`

- **Appearance**: redundant — the kernel already enforces these.
- **Reality**: AC checks enforce *Pack* conformance, not kernel
  conformance. The kernel's invariants are property-tested; Packs
  need a structural gate.
- **Discipline**: add `AC-NNN` codes for new invariants; never
  remove.

### 4.3 The 1084+ tests

- **Appearance**: more tests = more maintenance.
- **Reality**: each test pins a specific property the framework
  promises. Removing tests is *not* simplification; it is debt
  accumulation.
- **Discipline**: tests pin behaviour; simplification happens in code
  paths under tests.

### 4.4 The freeze matrix

- **Appearance**: a giant table; surely it can compress.
- **Reality**: every row is a *contract* with adopters and external
  runtimes. Compression destroys the contract.
- **Discipline**: leave verbose; the table is consulted line-by-line,
  not skimmed.

### 4.5 ESLint rules in `@adjudicate/eslint-config`

- **Appearance**: tooling overhead.
- **Reality**: each rule blocks a specific failure mode (e.g., AJD-104:
  no `Date.now()` in kernel). Removing a rule reintroduces the
  failure mode.
- **Discipline**: rules are second-line defence behind property tests.

---

## 5. Documentation that has shifted load

### 5.1 PROJECT_STATUS_AND_NEXT_STEPS.md

- **Original purpose**: pre-v1 roadmap tracker.
- **Current purpose**: post-v1 status snapshot.
- **Recommendation**: keep updating on every minor. Resist letting it
  bloat into "all things adjudicate". One-paragraph headline + bulleted
  priorities is the format.

### 5.2 PROJECT_STATUS vs CHANGELOGs

- **Possible duplication**: status doc + per-package CHANGELOG.
- **Reality**: status doc tracks *direction*; CHANGELOGs track
  *history*. Different consumers.

### 5.3 `docs/architecture/decisions.md`

- **Original purpose**: ADR index.
- **Status**: actively maintained.
- **Recommendation**: update on every ADR addition.

### 5.4 The new stewardship documents

Added in the post-v1 stewardship phase:

- `INSTITUTIONAL_RISK_REGISTER.md`
- `WHY_THE_INVARIANTS_EXIST.md`
- `LONG_TERM_STEWARDSHIP_REPORT.md`
- `MAINTAINER_GUIDE.md`
- `OPERATIONAL_ASSUMPTIONS.md`
- `FAILURE_MODE_CATALOG.md`
- `ECOSYSTEM_ANTI_FRAGILITY.md`
- `GOVERNANCE_PLAYBOOK.md`
- `CHANGE_REVIEW_CHECKLIST.md`
- `REPLAY_RISK_REVIEW.md`
- `REPLAY_LONGEVITY_MODEL.md`

Each is annual-review-touchable but otherwise stable. The set is
deliberately complete; no further additions should be needed for
multi-year operation.

---

## 6. Process pruning candidates

### 6.1 Per-PR ADR pressure

- **Observation**: maintainers may feel pressure to write ADRs for
  small changes.
- **Rule**: ADRs are for *architectural* decisions. Bug fixes,
  refactors, and additive features do not need ADRs.
- **Discipline**:
  [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §4.2
  enumerates non-ADR cases.

### 6.2 The annual review checklist length

- **Observation**: the annual review has ~6 items.
- **Rule**: each item is load-bearing. Do not add a seventh without
  retiring one.

### 6.3 CHANGELOG verbosity

- **Observation**: changeset descriptions can be long.
- **Rule**: changesets describe *user-facing change* and *why*.
  Implementation details belong in commit messages and PR
  descriptions.

---

## 7. Cost of *non-discipline*

Some maintenance overhead exists because the alternative is worse:

- **Property tests**: ~30s test runtime, but the alternative is
  shipping a replay-breaking change.
- **Freeze matrix updates**: 5 min per PR, but the alternative is
  silent semver drift.
- **Changesets**: 2 min per PR, but the alternative is no
  CHANGELOG.
- **Sigstore attestation**: 0 min (automated), but the alternative
  is no provenance.

Removing any of these saves nothing meaningful and costs years of
adopter trust.

---

## 8. The decay watchlist

Items that should be re-audited at the next annual review:

- [ ] CI dependencies (`pnpm/action-setup@v4`, `actions/setup-node@v4`,
      etc.) — pin to current major; verify next year.
- [ ] `engines.node >= 20.0.0` — Node 20 EOL is 2026; plan upgrade
      to 22 or 24 in a MINOR.
- [ ] `@noble/hashes` version — confirm still maintained.
- [ ] Pending changesets — fold into the next release cycle.
- [ ] `apps/web` and `apps/console` Next.js versions — non-core,
      can lag.

---

## 9. The simplification doctrine

When in doubt about simplification:

1. **Does removing this artefact lose institutional memory?** If
   yes, keep.
2. **Does removing this artefact reduce ongoing maintenance?** If
   not, keep.
3. **Does removing this artefact change adopter or operator
   behaviour?** If yes, treat as breaking change.

The framework's value is built by *not changing*. Simplification is
not virtuous in itself; it is virtuous when it reduces real burden
without losing real value.

---

## 10. The 10-year cost curve

Projected maintenance cost over the v1 line:

| Year | Annual maintainer days | Reason |
|---|---|---|
| 1   | 8–12 | Adopter-evidence loops; freeze matrix activation. |
| 2   | 5–8  | Stable; first MAJOR deferred. |
| 3   | 4–6  | Steady-state; v2.0 planning starts. |
| 4   | 4–6  | v2.0 release window. |
| 5–10 | 4–6  | Steady-state. |

At year 5, a maintainer is spending **one day a month**. This is the
target. Below it is neglect; above it is bureaucracy.

The framework's design assumes this curve. If reality diverges
substantially upward, the maintainer should reach for §6 (process
pruning) or §3 (simplification headroom). If it diverges downward,
verify that the annual obligations are still being honoured.

---

## 11. The summary line

The framework is past growth. The maintenance cost from now on is
*upkeep*, not *construction*. A maintainer who spends more than one
day a month is doing something the framework does not ask of them.
A maintainer who spends less than one day a quarter is neglecting
obligations encoded in this document.

Calibrate against the curve; trust the encoding.
