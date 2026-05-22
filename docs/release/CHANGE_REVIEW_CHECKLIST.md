# Change review checklist

> **Status.** Normative. The mechanical checklist applied to every PR
> against `@adjudicate/*`. Intended to reduce per-PR review to a
> finite, repeatable procedure that any maintainer (or AI-agent
> contributor) can apply without editorial judgement.
>
> Companion to [`GOVERNANCE_PLAYBOOK.md`](./GOVERNANCE_PLAYBOOK.md)
> (process meta-rules), [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md)
> (semver decision tree), and [`REPLAY_RISK_REVIEW.md`](./REPLAY_RISK_REVIEW.md)
> (replay-impacting changes).
>
> Use this checklist for *every* PR. Skip checklist items that
> obviously do not apply (e.g., a doc-only change skips the
> kernel-change items), but verify the skip is principled.

---

## 1. Pre-review (contributor responsibility)

Before requesting review, the contributor confirms:

- [ ] Tests pass locally (`pnpm install --frozen-lockfile && pnpm test`).
- [ ] Lint passes (`pnpm lint`).
- [ ] A changeset is included (`pnpm changeset`) **if** the change is
      not internal-only.
- [ ] The PR description states the **semver classification**
      (patch / minor / major) and **why**.
- [ ] If the change affects a `frozen` surface in
      [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md), an ADR is
      attached or proposed.

If any of these are absent, the PR is *not yet ready for review*;
return for revision before opening this checklist.

---

## 2. Mechanical gate — invariant safety

Confirm the change does **not** do any of the following. A "yes" to
any of these is a block:

- [ ] Add `metadata: Record<string, unknown>` or `confidence: number`
      to `Decision`, `IntentEnvelope`, or `AuditRecord`?
- [ ] Reorder the kernel guards from `kill → schema → state → taint →
      auth → business → default`?
- [ ] Include `createdAt` in the `intentHash` calculation, or exclude
      `nonce` from it?
- [ ] Introduce `Date.now()`, `Math.random()`, `process.env`, or any
      I/O inside `packages/core/src/kernel/`?
- [ ] Widen a closed enum (`DecisionKind`, `RefusalKind`,
      `BasisCategory`, `Taint`, `IntentActor.principal`) without a
      MAJOR plan?
- [ ] Remove or rename an exported identifier in
      `@adjudicate/core` without deprecation calendar elapse?
- [ ] Add a `record.update`, `record.delete`, or mutable method on
      `AuditRecord`?
- [ ] Introduce a hosted dependency in the trust path
      (`verifyPackTrust` calling out, framework-issued CA, etc.)?
- [ ] Add `Plan.forbiddenConcepts` (removed in v0.5) or an equivalent
      "advisory" field that promises enforcement it cannot deliver?
- [ ] Bypass `adjudicateAndAudit` in an adapter package?
- [ ] Mutate an existing entry in `canonical-hash-vectors.json` or
      `replay-longevity-corpus.json`?

If any check is "yes", **stop**. Either the change is mis-classified
or it is forbidden. Apply
[`GOVERNANCE_PLAYBOOK.md`](./GOVERNANCE_PLAYBOOK.md) §9 (invariant
escalation).

---

## 3. Mechanical gate — replay safety

If the change touches `packages/core/src/`, `packages/audit/src/`,
`packages/runtime/src/`, or `packages/audit-postgres/`, apply the
replay-risk review:

- [ ] [`REPLAY_RISK_REVIEW.md`](./REPLAY_RISK_REVIEW.md) opened and
      worked through.
- [ ] Golden vector tests
      (`packages/core/tests/hash-golden-vectors.test.ts`) still pass.
- [ ] Longevity corpus tests
      (`packages/audit/tests/replay-longevity.test.ts`) still pass.
- [ ] If the change *intentionally* alters replay behaviour, the PR
      includes the replay-classifier strategy in the description.

---

## 4. Mechanical gate — semver classification

Apply [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md) §2 decision
tree from top to bottom. Record the answer:

- [ ] Decision tree applied; classification matches PR's stated
      classification.
- [ ] Changeset content matches classification (`major` / `minor` /
      `patch`).
- [ ] If MAJOR: ADR attached; co-release plan documented;
      [`GOVERNANCE_PLAYBOOK.md`](./GOVERNANCE_PLAYBOOK.md) §6
      pre-flight items addressed.

---

## 5. Mechanical gate — surface stability

If the change modifies an exported identifier:

- [ ] [`V1_FREEZE_MATRIX.md`](./V1_FREEZE_MATRIX.md) updated to
      reflect the change.
- [ ] [`docs/release/api-surface.md`](./api-surface.md) updated.
- [ ] If a `frozen` surface: the change is `additive` per its
      extension policy, *not* a rename or removal.
- [ ] If an `experimental` surface: the change is documented in the
      changeset.

---

## 6. Mechanical gate — deprecation discipline

If the change introduces a `@deprecated` marker:

- [ ] JSDoc `@deprecated` tag present.
- [ ] Replacement API exists and is linked from the JSDoc.
- [ ] Codemod in `@adjudicate/migrate` ships with the same PR (or a
      follow-up PR landing in the same MINOR).
- [ ] Calendar entry added in [`deprecations.md`](./deprecations.md).
- [ ] Removal target ≥ 2 MAJORs out or ≥ 24 months out, whichever is
      longer.

If the change removes a deprecated API:

- [ ] Calendar entry's removal target has been reached.
- [ ] Codemod was shipped at deprecation time.

---

## 7. Mechanical gate — additive evolution

If the change adds a new feature:

- [ ] Extension category identified per
      [`EXTENSION_POLICY.md`](./EXTENSION_POLICY.md) §2.
- [ ] Closed enum *not* widened (or, if widened, MAJOR path applied).
- [ ] New basis code added to the Pack-local vocabulary (not kernel
      vocabulary) unless `KERNEL_REFUSAL_CODES` *explicitly* gains a
      member.
- [ ] New SEMCONV key follows the additive-only rule in
      [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
      §8.

---

## 8. Mechanical gate — Pack PR review

If the PR is in `packages/pack-*/`:

- [ ] `pnpm --filter @adjudicate/pack-* test` passes.
- [ ] `runConformance(pack)` returns no failures for the Pack.
- [ ] Manifest is consistent (`validatePackManifest` clean).
- [ ] Pack's `basisCodes` are declared in the Pack's local
      vocabulary, not silently in code.
- [ ] If the Pack ships a new intent kind, it follows the dotted
      kebab-case convention (`<pack>.<entity>.<action>`).

---

## 9. Mechanical gate — adapter PR review

If the PR is in `packages/adapter-core/` or `packages/anthropic/` or
`packages/openai/`:

- [ ] Adapter still calls `adjudicateAndAudit` for every intent
      adjudication.
- [ ] No provider SDK leaked into `adapter-core` (provider-neutrality).
- [ ] No kernel state mutation inside the adapter.
- [ ] `ProviderBridge<H>` shape unchanged or extended additively.

---

## 10. Mechanical gate — documentation discipline

For doc-only changes:

- [ ] Cross-references updated (incoming links to changed sections).
- [ ] No new `*.md` documents added unless explicitly required by an
      ADR or this checklist.
- [ ] If the change updates a "normative" document, the spec version
      is bumped (where applicable).
- [ ] No emoji unless explicitly requested by the user.

---

## 11. Mechanical gate — CI workflow changes

If the PR modifies `.github/workflows/`:

- [ ] ADR exists explaining the change.
- [ ] The new gate (or removed gate) preserves the invariants in
      [`GOVERNANCE_PLAYBOOK.md`](./GOVERNANCE_PLAYBOOK.md) §15.
- [ ] `scripts/rc-checks.ts` still passes (or is updated in lockstep).

---

## 12. Mechanical gate — dependency changes

If the PR modifies `package.json` or `pnpm-lock.yaml`:

- [ ] Lockfile was generated with `pnpm install --frozen-lockfile=false`
      (only when intentional).
- [ ] New dependency justified in PR description.
- [ ] If a new runtime dependency: it is *not* in the trust path, *not*
      hosted, *not* single-maintainer-and-unpinned.
- [ ] [`ECOSYSTEM_ANTI_FRAGILITY.md`](../architecture/ECOSYSTEM_ANTI_FRAGILITY.md)
      updated if the new dependency is load-bearing.

---

## 13. Acceptance

A PR is acceptable when:

1. All applicable §2–§12 boxes are ticked.
2. The contributor and at least one maintainer have signed off.
3. CI is green.
4. No blocking issue raised by a reviewer.

A PR is NOT acceptable when any of:

1. A §2 invariant-safety check is "yes".
2. A §3 replay-risk check is unresolved.
3. The semver classification in the PR does not match the §4
   decision tree's output.
4. A `frozen` surface is modified without an ADR.

---

## 14. Review-time signals

Two heuristics worth their salt:

- **If the PR is small but the diff is in `packages/core/src/kernel/`,
  reach for the property-test suite.** A small kernel change usually
  has a non-obvious replay implication.
- **If the PR is large and "refactors" an existing file, reach for
  the freeze matrix.** Refactors can rename identifiers; renames are
  MAJOR.

---

## 15. AI-agent contributions

When the PR was authored by an AI agent:

- [ ] Read the diff line-by-line for `Decision.metadata`-style
      proposals (a common AI failure mode is to "improve" by adding a
      bag).
- [ ] Confirm the changeset semver classification is principled, not
      a default value.
- [ ] Run the full property-test suite, not just the affected
      package.
- [ ] Verify any new comments are *load-bearing* (preserve intent),
      not narrative ("this fixes the bug from issue #123" rot in
      months).

AI agents are welcome contributors; their work demands the *same*
review, not a relaxed one.

---

## 16. Closing

This checklist is the framework's *only* per-PR discipline. Every
item on it has been pulled from a real failure mode or a constitutional
invariant. Adding new items requires the same ADR discipline as any
other governance change.

When you find yourself wanting to add a new check: write the test
first. If the test catches the failure, the check is redundant.
