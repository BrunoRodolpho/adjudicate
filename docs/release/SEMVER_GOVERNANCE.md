# Semver governance

> **Status.** Normative. Codifies the *process* that produces the semver
> outcomes documented in [`semver.md`](./semver.md). Companion to
> [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md),
> [`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md), and
> [`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md).
>
> `semver.md` says *what* counts as MAJOR / MINOR / PATCH.
> `EXTENSION_POLICY.md` says *what* may evolve and through what
> discipline. This document says *how* the framework reviews, classifies,
> and publishes a given change.

---

## 1. Goals

The framework runs as production-grade governance infrastructure for
years per adoption cycle. Adopters need to predict, at PR-review time,
**exactly** what semver lane a change lands in. This document defines
the gates so that prediction is mechanical, not editorial.

Goals, in priority order:

1. **No surprise breakages.** Every breaking change is preceded by the
   deprecation lifecycle in `EXTENSION_POLICY.md` §5.
2. **Replay continuity.** Every release classifies as `IDENTICAL` or
   `BASIS_ONLY` against the prior version's audit corpus, OR is a
   coordinated MAJOR with replay shims.
3. **Coordinated multi-runtime release.** Wire-format MAJORs do not
   land in the Node reference before companion runtimes are ready.
4. **Auditable history.** Every semver decision leaves a paper trail
   (CHANGELOG, ADR if architectural, freeze-matrix update).

---

## 2. The semver decision tree

Apply, in order, until one matches.

```
1. Does the change alter:
   - the canonical-JSON hash recipe
   - the IntentEnvelope v2 schema (required-field add or shape change)
   - the AuditRecord wire (required-field add or shape change)
   - the closed Decision algebra
   - the closed Taint / RefusalKind / BasisCategory / IntentActor enum
   - the guard evaluation order
   - the fail-closed default
   - the determinism guarantee on adjudicate()
   - the public surface in a removal- or rename-equivalent way
   ?
   → MAJOR  (coordinated; see §6)

2. Does the change ALSO require an adopter code change to keep
   building, linking, and running with no behaviour difference?
   → MAJOR

3. Is the change a deprecation marker that retains the prior behaviour
   AND ships a codemod in the same release AND lands a deprecations.md
   entry?
   → MINOR  (deprecation marker; removal is a future MAJOR)

4. Is the change additive: new optional field, new optional parameter,
   new export, new ADR-gated experimental surface, new analyzer code,
   new conformance check, new CLI subcommand or option, new locale
   table, new BASIS_CODES code within an existing category, new
   SEMCONV attribute, new optional sink callback?
   → MINOR

5. Is the change a bug fix that brings observable behaviour closer to
   the documented spec AND does not change the Decision adopters
   previously observed?
   → PATCH

6. Is the change purely internal — refactor, perf, test, doc, internal
   type tightening, build tooling?
   → PATCH
```

Edge cases:

- **Replay-affecting bug fix**: a fix that *changes* the Decision
  adopters previously observed is **MAJOR**, never PATCH, even if the
  prior behaviour was unintended. The replay invariant is the load-
  bearing product property.
- **New required field with safe default**: still MAJOR. Adopters who
  build against the type signature break at compile time.
- **Internal `_reset*` helper changes**: these are prefixed for tests
  but exported intentionally. Renaming them is MINOR; removing them is
  MAJOR.

---

## 3. Pre-merge gates

Every PR that touches the public surface ships with all of:

| Gate                                    | Mechanism                                          |
|---|---|
| Freeze-matrix update                    | manual edit to `V1_FREEZE_MATRIX.md` + `pnpm check:freeze-matrix` |
| Type snapshot                           | per-package `api-surface.test.ts`                  |
| CHANGELOG entry                         | `.changeset/<name>.md` matching the lane           |
| Replay-classification test (when wire-adjacent) | re-run cross-runtime vectors                |
| Replay-equivalence test (when guard / kernel-adjacent) | re-run kernel invariants property suite |
| Codemod (when deprecation)              | new entry in `@adjudicate/migrate`                 |
| ADR (when architectural)                | new file in `docs/architecture/adr/`               |
| Multi-runtime impact assessment (when wire-format) | new section in the freeze matrix + co-release coordination |

CI runs `pnpm rc:check` which combines lint, typecheck, test, version
checks, freeze-matrix check, and audit. A PR that fails any of these
gates does not land regardless of the semver lane.

---

## 4. Release classification process

When cutting a release, the maintainer:

1. Runs `pnpm rc:check` against the release candidate branch.
2. Inspects the changeset entries; classifies the bundle into the
   highest semver lane any single entry requires (MAJOR > MINOR > PATCH).
3. Confirms every entry's freeze-matrix row reflects its current tier.
4. For MAJORs only: confirms the coordinated co-release schedule with
   multi-runtime maintainers.
5. Updates package versions per the lane (`@changesets/cli`).
6. Cuts the release tag.
7. Publishes the CHANGELOG entries and freeze-matrix diff alongside.

---

## 5. Public-surface diff tooling

The freeze matrix is the source of truth for the surface. Tooling
keeps the matrix honest:

- **`scripts/check-freeze-matrix.ts`** asserts every exported symbol
  appears in the matrix. New exports without a matrix row fail CI.
- **`scripts/check-versions.ts`** asserts package versions are consistent
  across the workspace.
- **`scripts/rc-checks.ts`** runs the full release pipeline locally;
  this is what `.github/workflows/release-candidate.yml` runs on tag
  push.

A PR that adds a new public symbol *must* also add a matrix row in the
same PR. The CI check is mechanical, not advisory.

---

## 6. Coordinated MAJOR procedure

A wire-format MAJOR — anything that changes the canonical-JSON hash
recipe, the envelope schema, or the audit-record schema in a non-
additive way — follows this sequence:

### Step 1 — ADR + replay-shim design

1. Open ADR documenting the change, the failing vectors, and the
   replay-shim plan.
2. Land the ADR as `Proposed`; collect comments from multi-runtime
   maintainers.

### Step 2 — Reference implementation behind a flag

1. New schema: `docs/specs/intent-envelope-vN.schema.json`.
2. New vectors: `docs/specs/canonical-hash-vectors-vN.json`.
3. Replay shim in `@adjudicate/core` that reads both versions.
4. Property tests pinning both versions.
5. Feature flag (`enableEnvelopeVN`) defaults off.

### Step 3 — Multi-runtime co-release window

1. Communicate the change to multi-runtime maintainers; freeze the
   shim shape.
2. Each runtime ships its own MAJOR with the new shim.
3. The Node reference releases the MAJOR with the flag default
   flipped to on.

### Step 4 — Deprecation calendar

1. The old envelope version stays read-only-supported for at least
   two MAJOR cycles per `semver.md`.
2. Adopters get advance notice via `deprecations.md`.

### Step 5 — Removal MAJOR

Only at the second MAJOR after deprecation does the old shim leave the
codebase.

---

## 7. Invariant-regression gates

The framework's invariants are pinned by tests. Any PR that touches
the kernel must:

- pass `packages/core/tests/kernel/invariants/` (property-style;
  determinism, hash stability, replay safety, guard ordering);
- pass `packages/core/tests/cross-runtime-hash-vectors.test.ts`
  (wire-format vectors);
- pass `packages/conformance/tests/conformance.test.ts` (AC-001..AC-006);
- pass the chaos suites in `packages/audit/tests/chaos-*.test.ts`
  (kill-switch convergence, replay-integrity tamper detection).

A regression in any of these blocks merge. The gates are mechanical;
no override is available — the cost of bypassing them is the ecosystem-
wide replay invariant.

---

## 8. Ecosystem-impact review

For changes that affect Pack authors:

- New conformance check (`AC-NNN`): adopter audit. Document in the
  changeset which prior-passing Packs would now fail; recommend a
  grace-period flag if necessary.
- New analyzer diagnostic (`AJD-NNN`): default `severity: "warn"` for
  one MINOR cycle, then `severity: "error"` in the next MINOR. Document
  in the changeset.
- New `BASIS_CODES` entry: re-emit the cross-runtime vectors;
  document in changeset.
- New Pack manifest required field: MAJOR (per the matrix in
  `EXTENSION_POLICY.md` §6).

For changes that affect operators:

- New operational incident class, new replay-failure class, new
  kill-switch source, new pause phase: closed enums; additive in
  MINOR. Dashboards built today keep working.

---

## 9. Freeze-boundary review workflow

When a PR touches the freeze matrix:

1. Reviewer confirms every modified row's `Tier`, `Replay impact`,
   `Migration impact`, `Semver`, `Extension`, and `Tol.` columns are
   consistent with the diff.
2. If the change crosses a tier (`E → F`, `F → D`, `D → X`), the
   CHANGELOG carries a matrix-citation entry.
3. The freeze-matrix snapshot test (`scripts/check-freeze-matrix.ts`)
   asserts that every public export is enumerated.
4. CI blocks merge until both the matrix and the test are in sync.

---

## 10. Replay-compatibility gate

The single rule that everything else folds into (cf. `semver.md`):

> A bundle that produced a particular Decision at version `vX.Y.Z`
> must, when replayed against the same envelope + state in any later
> version `vX.Y′.Z′`, produce a Decision that classifies as `IDENTICAL`
> or `BASIS_ONLY` per `replay-classify`.

The gate is mechanical: the freeze matrix records `Replay impact` per
surface. A PR that touches a `decision`-impact surface re-runs the
historical-replay regression suite. A PR that touches a `basis-only`-
impact surface re-runs the conformance + analyzer suites.

If the regression suite reports `DECISION_KIND` mismatches, the
change is MAJOR — no exception, regardless of any other classification.

---

## 11. Ecosystem-impact metrics

Post-release, the framework tracks (via the opt-in ecosystem-telemetry
primitive when adopters report):

- Conformance-check pass rate across the Pack ecosystem.
- Replay-drift incidence per release tag (via `classifyReplayDrift`).
- Codemod adoption rate (via `MigrationPainSnapshot`).
- Analyzer diagnostic triage outcomes (via `AnalyzerTriageSnapshot`).

These metrics inform the next release cycle's risk classification.
Adopters who do not report telemetry are unaffected — the framework
optimises for opt-in evidence-driven evolution, not surveillance.

---

## 12. Hotfix lane

A PATCH release for a security or correctness issue may land outside
the normal cadence when:

- The fix is local (one package).
- The fix does not change the Decision adopters previously observed.
- The fix passes the full invariant-regression gate.
- The fix is documented in the security advisory channel
  (`SECURITY.md`).

Hotfixes that change Decision outcomes are MAJORs, not hotfixes. The
hotfix lane exists for bugs that produce wrong outputs (e.g.,
`buildEnvelope` mis-computing the hash); fixes there are MAJOR because
the prior outputs are now mis-labeled.

---

## 13. Reviewer checklist

For maintainers reviewing a release-bound PR:

- [ ] Changeset entry present and correctly classified.
- [ ] Freeze-matrix row added/updated for every public-surface change.
- [ ] Type snapshot updated.
- [ ] `pnpm rc:check` passes locally.
- [ ] Replay-regression suite passes.
- [ ] Conformance harness passes against all in-tree Packs.
- [ ] If MAJOR: ADR landed; multi-runtime co-release plan posted;
      deprecation calendar updated.
- [ ] If MINOR: deprecations.md unchanged (this PR is not a removal).
- [ ] If PATCH: behaviour assertion that prior Decision outcomes are
      preserved.
- [ ] CHANGELOG entry's "why" is one or two sentences; details live in
      the freeze-matrix row or the ADR.

---

## 14. Conflict resolution

When two PRs would touch the same freeze-matrix row:

1. The PR that lands first wins the row.
2. The second PR rebases against the new matrix; if its semver lane
   shifted (e.g., from MINOR to MAJOR because another MINOR landed
   first), the second PR's changeset is reclassified before merge.
3. If both PRs are MAJORs in the same release window, they ship in
   one coordinated MAJOR or one defers to the next cycle.

No "implicit" multi-MAJOR releases.

---

## 15. Process invariants

Process rules the framework maintainers commit to honouring:

- No squash-and-ship of multiple lanes. One PR per semver lane within
  a release.
- No silent MAJOR. Every MAJOR carries an ADR + a deprecation calendar
  entry + a freeze-matrix diff.
- No retroactive deprecation. A deprecation marker lands at the same
  release as the codemod.
- No release without the rc-check pipeline. Including hotfixes.
- No matrix bypass. CI failure on `check:freeze-matrix` blocks merge;
  there is no override.

These invariants are themselves part of the framework's promise. They
do not change without an explicit ADR + a new SEMVER_GOVERNANCE
revision.
