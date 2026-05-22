# Governance playbook

> **Status.** Normative. The institutional-continuity playbook for
> running `@adjudicate/*` through the post-v1 phase and into multi-
> maintainer-generation operation. Codifies the *processes* that must
> survive maintainer turnover so future contributors make compatible
> decisions without needing original authors.
>
> Companion to [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md) (semver
> decision tree), [`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md)
> (additive evolution), [`CHANGE_REVIEW_CHECKLIST.md`](./CHANGE_REVIEW_CHECKLIST.md)
> (per-PR gate), [`REPLAY_RISK_REVIEW.md`](./REPLAY_RISK_REVIEW.md)
> (replay-impacting changes), and [`MAINTAINER_GUIDE.md`](../ops/MAINTAINER_GUIDE.md)
> (onboarding).
>
> This document answers: "what does a maintainer *do*?" The answer is
> deliberately small. The framework is governance infrastructure; its
> processes should be no larger than they need to be.

---

## 1. The maintainer's three responsibilities

A `@adjudicate/*` maintainer has three responsibilities and no more:

1. **Reject changes that violate constitutional invariants.**
   ([`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md).)
2. **Approve only additive evolution.** ([`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md).)
3. **Keep releases cuttable.** Per §3.

Everything else is delegated to encoded artefacts: tests, ADRs,
freeze matrix, conformance checks. **The framework runs itself; the
maintainer guards the substrate.**

If you find yourself making editorial decisions, the answer is
encoded somewhere. Find it and cite it. If it is *not* encoded, write
the encoding (ADR or test) and only then make the decision.

---

## 2. PR review discipline

Every PR runs through [`CHANGE_REVIEW_CHECKLIST.md`](./CHANGE_REVIEW_CHECKLIST.md).
That document is the mechanical gate; this document is the *meta-rule*:

- **Default response is "show me the encoded constraint".** Before
  approving, identify which test, ADR, conformance check, or freeze
  matrix entry approved this change. If none, the change needs one
  before merge.
- **Default response on disagreement is "open an ADR".** Editorial
  debates indicate the decision has not been encoded.
- **Default response on uncertainty is "ask the test suite".** The
  property tests in `packages/core/tests/kernel/invariants/` are the
  arbiter; if they don't catch the change, either the change is safe
  *or* the test is missing.

A PR that cannot be reviewed mechanically — that needs editorial
input to assess safety — should be split until the parts are
mechanically reviewable.

---

## 3. Release discipline

The framework is *pull-driven*. Releases happen because someone needs
one, not because the calendar said so.

### 3.1 When to cut a release

- A changeset has been merged and ≥ 1 adopter is waiting on it.
- A security fix has been merged (always).
- A bug-fix changeset has been waiting for the changesets bot's
  "Version Packages" PR for > 30 days.
- A wire-format MAJOR is staged with companion-runtime co-release
  ready.

**Do not cut releases for "polish".** The cost of churning adopters
through patch upgrades that don't fix anything they care about is
higher than the cost of stale changesets.

### 3.2 Release sequence (patch / minor)

1. Confirm `main` is green on `ci.yml`.
2. Merge the changeset bot's "Version Packages" PR.
3. `release.yml` publishes; verify success.
4. Tag the release on GitHub (`git tag vX.Y.Z && git push --tags`).
5. Announce in the relevant channels (see §10 for the channel list).

### 3.3 Release sequence (MAJOR)

A MAJOR is a multi-week event. The sequence:

1. **Open the MAJOR window.** Post in announcement channels.
   Communicate the wire-format change scope.
2. **Stage `-rc` packages.** Each affected `@adjudicate/*` package
   publishes a pre-release: `pnpm publish --tag rc`.
3. **Coordinate cross-runtime release.** Rust, Go, Python (if any)
   re-implementations must release the same wire-format version on
   the same day or earlier.
4. **Update the freeze matrix.** Frozen-surface changes lift the
   constraint and re-pin at the new version.
5. **Update `V1_CERTIFICATION_REPORT.md`** (or the appropriate
   per-MAJOR equivalent) with the certification artefacts.
6. **Run RC gate.** `release-candidate.yml` must pass.
7. **Promote `rc` to `latest`.** `pnpm dist-tag add @adjudicate/core@X.0.0 latest`.
8. **Post-release:** update the
   [`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md) with the new line.

---

## 4. ADR discipline

ADRs (architectural decision records) are the *paper trail* for
non-mechanical decisions. The discipline:

### 4.1 When to write an ADR

- A new architectural decision (interface seam, package boundary,
  wire-format change).
- A reversal of a prior ADR.
- A decision that *would otherwise* require editorial maintainer
  input to enforce.

### 4.2 When *not* to write an ADR

- Bug fixes.
- Documentation edits.
- Test additions that pin existing behaviour.
- Refactors that preserve behaviour.

### 4.3 ADR format

The format is the existing one at `docs/architecture/adr/ADR-NNN-*.md`.
Headlines: context, decision, consequences. ADRs are short; this
document is *longer than most ADRs*. That is intentional — ADRs are
for the *future maintainer*, not the present one. The format constraint
keeps them readable.

### 4.4 ADR allocation

Allocate the next sequential number (`ADR-117` after `ADR-116`).
Reserve the number with a stub commit if the work spans multiple PRs.

---

## 5. Conformance and analyzer discipline

The framework's *enforcement layer* is in three packages:

- `@adjudicate/conformance` — AC-001..AC-NNN runtime invariants.
- `@adjudicate/analyze` — AJD-1NN (Tier 1) and AJD-2NN (Tier 2 AST)
  diagnostics.
- ESLint rules in `@adjudicate/eslint-config`.

Adding to these is the *primary* lever a maintainer has. When you find
yourself wanting to "warn adopters not to do X", write an analyzer
diagnostic, not a doc paragraph.

Discipline:

- **AC-NNN allocation**: reserve the next AC number; add the check
  module; update `MULTIRUNTIME_CONFORMANCE.md` §4 if the new check is
  cross-runtime-relevant.
- **AJD-NNN allocation**: ADR-109 catalogues the assigned codes.
  Update it when allocating.
- **Per-diagnostic severity**: adopter-controllable via the analyzer
  config; the framework recommends but does not impose.

---

## 6. Wire-format change discipline

The single most consequential class of change. The discipline:

### 6.1 Pre-flight checklist

- [ ] ADR drafted.
- [ ] Co-release plan with any third-party runtimes confirmed.
- [ ] Golden vectors at the new version drafted in
      `docs/specs/canonical-hash-vectors.json`.
- [ ] JSON Schema at the new version drafted in
      `docs/specs/intent-envelope-vN.schema.json`.
- [ ] Replay-shim strategy documented (how do v(N-1) records replay
      against the new kernel?).
- [ ] Migration documented in
      [`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md).

### 6.2 Land

The change lands as a MAJOR. The new version coexists with the prior
via the audit-record `version` field; `replay-classify` selects the
right canonicaliser per record.

### 6.3 Post-flight

- [ ] Longevity corpus
      ([`docs/specs/replay-longevity-corpus.json`](../specs/replay-longevity-corpus.json))
      extended with new-version fixtures (existing fixtures *unchanged*).
- [ ] `LONG_TERM_STEWARDSHIP_REPORT.md` updated.

---

## 7. Deprecation discipline

Per [`deprecations.md`](./deprecations.md):

- A deprecation lands as a MINOR with `@deprecated` JSDoc + a codemod
  in `@adjudicate/migrate`.
- The calendar removal target is ≥ 2 MAJORs or 24 months, whichever
  is longer.
- Removal is irreversible.

When you find yourself about to remove an API, the *first* question
is: "did this clear the deprecation calendar?" If not, defer.

---

## 8. Semver dispute resolution

When two reviewers disagree on a PR's semver classification, the
resolution is mechanical, not editorial:

1. Apply the decision tree in
   [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md) §2 from top to
   bottom.
2. If the tree returns a clear answer, that answer is binding.
3. If the tree is ambiguous, the change is *not yet specified*. Open
   an ADR that specifies it; the ADR's resolution is the resolution.

There is no "tie-breaker maintainer". The encoded rules are the
arbiter.

---

## 9. Invariant-escalation procedure

When a contributor proposes a change that *appears* to violate an
invariant, the escalation:

1. **Re-read the relevant section of [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md).**
   The rationale is encoded there.
2. **Identify the property that would be lost.** If you cannot
   articulate it, the invariant is mis-stated or the change is
   actually safe.
3. **Cite the rationale in the PR comment.** Decline the change with
   a pointer to the specific section.
4. **If the contributor pushes back with a substantive argument,**
   the proposal is now an ADR. Open it; resolve via the ADR process.

**Do not** approve invariant violations because the contributor is
persistent. Invariants are constitutional; persistence is not an
amendment process.

---

## 10. Communication channels

The framework's communication discipline:

- **GitHub Issues** — for bugs, feature requests, security advisories.
- **GitHub Discussions** — for adopter questions, design proposals.
- **CHANGELOG.md** files — for per-package release history (auto-
  generated by changesets).
- **Adopter mailing list / Discord** — optional, adopter-driven, not
  framework-owned.

The framework does not run a hosted dashboard, a hosted analytics
service, or a hosted forum. The reasons are in
[`ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md)
§2.

---

## 11. Maintainer-absent operation

The framework is designed to remain useful during periods of
maintainer absence.

### 11.1 Definition

The framework enters "maintainer-absent" mode when:

- no maintainer has responded to issues in 90 days, *and*
- no release has been cut in 90 days *despite* outstanding security
  advisories or merged-but-unreleased changesets.

### 11.2 Implications

- **Adopters continue to use published versions.** No degradation.
- **Forks become permitted recovery paths.** See §12.
- **Security advisories accumulate.** Adopters must assess risk
  independently.
- **The freeze matrix becomes informational rather than enforced.**
  The substrate is the v1 contract; that contract continues to hold
  in published versions.

### 11.3 Revival procedure

A new maintainer (or fork) reactivates the project by:

1. Posting in GitHub Discussions and the adopter list announcing
   revival intent.
2. Reading the entire `docs/architecture/` and `docs/release/`
   directories, including this playbook.
3. Running the test suite to confirm posture.
4. Cutting a "revival" release (could be patch) within 14 days of
   announcement.
5. Signing in [`docs/execution/decisions-log.md`](../execution/decisions-log.md)
   with the bus-factor entries from §13.

---

## 12. Lost release credentials

If the maintainer holding NPM_TOKEN or GitHub repo admin departs without
handover:

1. **Existing versions remain usable** indefinitely. No action required
   for adopters.
2. **A new maintainer with org admin** can:
   - regenerate NPM_TOKEN (npm org admin path);
   - take over GitHub repo admin via npm org admin or org dispute
     process.
3. **If no org admin remains**, fork is the recovery path:
   - publish under a new npm scope (e.g., `@adjudicate-revival/*`);
   - document the lineage in
     [`docs/execution/decisions-log.md`](../execution/decisions-log.md);
   - adopters opt-in by changing the dependency scope at next upgrade.

The framework's v1 line is a closed contract; a fork that preserves
the wire format, the canonical hash, and the closed enums continues
to participate in the ecosystem. **The npm scope is the brand; the
contract is the substance.**

---

## 13. Bus-factor entries

Annual review (or on maintainer change), each active maintainer fills
in the bus-factor entries in
[`docs/execution/decisions-log.md`](../execution/decisions-log.md):

- What knowledge concentrated on me this year?
- What did I encode (test, ADR, doc) that reduced that concentration?
- What is *still* concentrated on me that the next year should
  encode?

The institutional-risk register
([`INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md))
is updated from these entries.

---

## 14. Security advisory discipline

When a security advisory lands on a `@adjudicate/*` package or a
dependency:

1. **Triage within 48 hours.** Severity assessment + impact
   classification.
2. **High/critical severity**: patch release within 7 days, before
   public disclosure if possible.
3. **Medium severity**: include in the next regularly-scheduled
   minor.
4. **Low severity**: document and defer to the next minor.
5. **Document in `docs/security/`** with advisory id, affected
   versions, and remediation.

Security fixes are an exception to the "pull-driven" release policy;
they are *time-driven*.

---

## 15. The forbidden actions

A maintainer must NOT, regardless of pressure:

- Approve a wire-format change without an ADR + golden vectors + co-release plan.
- Approve a removal of a deprecated API before the calendar elapses.
- Mutate a golden hash vector.
- Reorder kernel guards.
- Add `Decision.metadata` or `Decision.confidence`.
- Introduce `Date.now()` or `Math.random()` inside `adjudicate()`.
- Centralise trust (framework-issued CA, hosted registry, etc.).
- Skip the property-test suite on a "small" refactor.
- Force-push to `main`.
- Delete tags or release branches.

These are not "best practice". They are the bright lines. A
maintainer who crosses them has violated the trust adopters built
into the framework.

---

## 16. The annual governance review

Once per year, the active maintainer (or a designated reviewer):

- [ ] Walks [`INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md);
      confirms each mitigation still resolves.
- [ ] Walks [`OPERATIONAL_ASSUMPTIONS.md`](../ops/OPERATIONAL_ASSUMPTIONS.md);
      confirms each assumption's upstream is healthy.
- [ ] Walks [`ECOSYSTEM_ANTI_FRAGILITY.md`](../architecture/ECOSYSTEM_ANTI_FRAGILITY.md);
      confirms each tier-1 mitigation is in place.
- [ ] Runs the longevity test
      ([`packages/audit/tests/replay-longevity.test.ts`](../../packages/audit/tests/replay-longevity.test.ts))
      against the current main.
- [ ] Updates the [`LONG_TERM_STEWARDSHIP_REPORT.md`](../architecture/LONG_TERM_STEWARDSHIP_REPORT.md).
- [ ] Signs in [`docs/execution/decisions-log.md`](../execution/decisions-log.md).

This is the only recurring obligation. It takes a day. It is the
discipline that keeps the framework's longevity property truthful.
