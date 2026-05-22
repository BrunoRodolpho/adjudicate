# Replay-risk review

> **Status.** Normative. The per-PR review checklist for changes that
> could affect replay determinism, audit-record verifiability, or
> cross-runtime parity. Applied as part of
> [`CHANGE_REVIEW_CHECKLIST.md`](./CHANGE_REVIEW_CHECKLIST.md) §3.
>
> Companion to
> [`REPLAY_LONGEVITY_MODEL.md`](../specs/REPLAY_LONGEVITY_MODEL.md)
> (10-year longevity contract),
> [`canonical-json-hash.md`](../specs/canonical-json-hash.md) (hash
> recipe), [`MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md)
> (cross-runtime equivalence), and
> [`SEMVER_GOVERNANCE.md`](./SEMVER_GOVERNANCE.md) (semver decision tree).
>
> Replay is the single most consequential property of the framework.
> A silent replay drift is a *catastrophic* failure mode: years of
> audit records become unverifiable in lockstep. This document is the
> mechanical gate that prevents that.

---

## 1. When to apply this review

Open this review for any PR that:

- modifies `packages/core/src/hash.ts` or its imports;
- modifies `packages/core/src/envelope.ts` or its consumers;
- modifies `packages/core/src/audit.ts` or `verifyAuditRecord`;
- modifies `packages/core/src/basis-codes.ts`;
- modifies `packages/audit/src/replay*.ts`;
- modifies `packages/audit/src/replay-integrity.ts`;
- modifies `packages/audit-postgres/migrations/`;
- adds, removes, or edits an entry in
  `docs/specs/canonical-hash-vectors.json`;
- adds, removes, or edits an entry in
  `docs/specs/replay-longevity-corpus.json`;
- adds, removes, or edits a closed enum (`DecisionKind`,
  `RefusalKind`, `BasisCategory`, `Taint`).

If none of the above apply, this review is **not required**. Most
PRs do not need it.

---

## 2. The risk taxonomy

Replay-affecting changes fall into four classes, each with a
documented response:

| Class | Description | Response |
|---|---|---|
| `none` | No replay impact (e.g., docs, refactor, internal-only) | proceed |
| `basis_refinement` | A basis code splits, a refusal code adds | MINOR + replay classifies as `BASIS_ONLY` |
| `decision_kind_change` | A Decision's kind changes for some input | MAJOR + replay-shim |
| `wire_format` | Envelope/AuditRecord shape change | MAJOR + version bump + co-release |

The review's purpose is to identify which class the PR falls into,
then apply the response.

---

## 3. Identification questions

Answer each with the smallest unit of evidence.

### 3.1 Hash recipe

- [ ] Does the change touch `canonicalize()`, `canonicalJson()`, or
      `sha256Canonical()` in `packages/core/src/hash.ts`?
- [ ] Does the change alter the *input set* of the canonical hash
      (e.g., adding a field, removing one, reordering hashed fields)?
- [ ] Does the change switch the underlying SHA-256 library?

**If yes to any**: this is `wire_format` class. Proceed only with
MAJOR plan + co-release.

### 3.2 Envelope schema

- [ ] Does the change add a required field to `IntentEnvelope`?
- [ ] Does the change change the type of an existing field?
- [ ] Does the change increment `INTENT_ENVELOPE_VERSION` to `3`?

**If yes**: this is `wire_format`. MAJOR + new schema + new golden
vectors + replay-shim for v2.

### 3.3 Audit record schema

- [ ] Does the change add a *required* field to `AuditRecord`?
- [ ] Does the change increment `AUDIT_RECORD_VERSION`?
- [ ] Does the change alter the `auditHash` derivation (i.e., the
      subset of `record` included in the hash)?

**If yes to the first or third**: this is `wire_format`. MAJOR.

**If yes to the second only (e.g., v4 → v5 with new optional
fields)**: this is `basis_refinement` (additive). MINOR; readers
branch on `version`.

### 3.4 Basis vocabulary

- [ ] Does the change add a basis code to `BASIS_CODES`?
- [ ] Does the change rename or remove an existing basis code?
- [ ] Does the change move a code between categories?

**If add**: this is `basis_refinement`. MINOR if additive; verify the
addition does not collide with an adopter's Pack-local code (these
are namespaced by category, so collisions are rare but possible).

**If rename or remove**: this is `decision_kind_change`. MAJOR;
deprecation calendar required.

### 3.5 Closed enums

- [ ] Does the change widen `DecisionKind`?
- [ ] Does the change widen `RefusalKind`?
- [ ] Does the change widen `Taint`?
- [ ] Does the change widen `IntentActor.principal`?
- [ ] Does the change widen `BasisCategory`?

**If yes**: this is `wire_format` class (closed enums are part of
the wire contract). MAJOR + co-release.

### 3.6 Guard ordering

- [ ] Does the change reorder the kernel's guard sequence?
- [ ] Does the change add a new guard phase (e.g., between `auth`
      and `business`)?
- [ ] Does the change change the fall-through behaviour (e.g., new
      `default` semantics)?

**If yes**: this is `decision_kind_change`. MAJOR. The reorder is
constitutional per
[`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
§11. Default response: **reject**.

### 3.7 Determinism

- [ ] Does the change introduce a clock call inside `adjudicate()`?
- [ ] Does the change introduce a randomness source?
- [ ] Does the change introduce async / I/O / global state?

**If yes**: this is `decision_kind_change`. Default response:
**reject**. Determinism is constitutional per
[`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
§3.

---

## 4. Tests that must pass

For any change classified as `basis_refinement` or above, all of
the following must pass:

- [ ] `packages/core/tests/hash-golden-vectors.test.ts` — every
      golden hash unchanged.
- [ ] `packages/core/tests/kernel/invariants/v2-hash-stability.property.test.ts` —
      hash determinism under reordered fields.
- [ ] `packages/core/tests/kernel/invariants/replay-determinism.property.test.ts` —
      property test of replay determinism.
- [ ] `packages/audit/tests/replay.test.ts` + `replay-integrity.test.ts` —
      replay primitives.
- [ ] `packages/audit/tests/replay-longevity.test.ts` — long-range
      corpus (this is the canary for cross-version replay).
- [ ] `packages/conformance/tests/` — AC-002 (replay determinism) +
      AC-003 (envelope hash stability) + AC-004 (basis purity).

If any of these fail after the change, **the change is broken**, not
the tests.

---

## 5. Vector update discipline

If the change is `wire_format` and ships a new envelope version:

- [ ] New vectors added to `canonical-hash-vectors.json`.
- [ ] **Existing vectors unchanged.** A new shape is a *new* vector,
      not a mutation.
- [ ] Python cross-runtime checker in
      [`canonical-json-hash.md`](../specs/canonical-json-hash.md)
      updated to produce the new hashes.
- [ ] Longevity corpus entry added for the new version (existing
      entries unchanged).

If the change is `basis_refinement`:

- [ ] No vector mutations (refinement is replay-side, not hash-side).
- [ ] AJD-103 (basis vocabulary purity) coverage extended.

---

## 6. Replay-shim discipline

If the change is `decision_kind_change` for some inputs (e.g., a
basis code is removed):

- [ ] The historical decisions are documented in the changeset.
- [ ] The replay-shim is documented: how does a v(N-1) record
      replay against the new kernel?
- [ ] `audit-postgres/replay.ts` handles the legacy version (see
      `legacyV1ToV2` as the template).
- [ ] `replay-classify` selects the right algorithm by record
      version.

If no replay-shim is possible (e.g., the change cannot be made
backwards-compatible), the change is *not* a replay-shim; it is a
MAJOR-with-discontinuity. Document the discontinuity in the
[`UPGRADE-PLAYBOOK.md`](./UPGRADE-PLAYBOOK.md).

---

## 7. Multi-runtime co-release

If the change is `wire_format`:

- [ ] Any third-party runtime claiming interop has been notified.
- [ ] Their release plan aligns with the framework's.
- [ ] The framework's release waits on the runtime's readiness (or
      vice versa).
- [ ] Vector compatibility is verified before the framework's MAJOR
      cuts.

If no third-party runtime exists at the time of the MAJOR, this
section is moot — but document the absence in the ADR so a future
runtime knows the MAJOR's reasoning.

---

## 8. Audit-postgres migration discipline

If the change modifies `packages/audit-postgres/migrations/`:

- [ ] Migration is *additive* — new column with default, new index,
      new table.
- [ ] No `DROP COLUMN`, no destructive `ALTER`.
- [ ] Migration is forward-only; no rollback script.
- [ ] Migration number follows the sequence (next after `008-` is
      `009-`).
- [ ] Existing partition_month rows queryable post-migration.
- [ ] If the migration touches `record_version`, the reader logic in
      `packages/audit-postgres/src/replay.ts` handles all versions
      including the new one.

---

## 9. Decision matrix

After answering §3, classify the change:

| Answers | Class | Action |
|---|---|---|
| All "no" in §3 | `none` | Proceed normally. This review can be closed. |
| §3.4 add-only | `basis_refinement` | MINOR + AJD-103 update |
| §3.3 v-bump optional fields only | `basis_refinement` | MINOR + migration |
| §3.5 add to closed enum | `wire_format` | MAJOR + co-release |
| §3.6 or §3.7 yes | `decision_kind_change` | **REJECT** unless constitutional ADR |
| §3.1 or §3.2 wire-shape | `wire_format` | MAJOR + envelope vN + co-release |

---

## 10. The escape hatch

There is one — and only one — escape hatch from this review: an
ADR that explicitly amends a constitutional invariant. This is the
mechanism for a coordinated v2.0 transition that intentionally
breaks v1's invariants. The ADR must:

- Cite the specific invariant being amended.
- Document the multi-runtime release plan.
- Pre-stage the new vectors, schemas, and shim.
- Plan the deprecation calendar for any incompatibility.

The escape hatch has never been used in the v1 line. It is
documented because the v2.0 line will eventually need it.

---

## 11. Sign-off

When this review is complete, record in the PR description:

```
## Replay-risk review

- Class: [none | basis_refinement | decision_kind_change | wire_format]
- §3 risk identification: [link to answered questions]
- §4 test results: [all passing | failures investigated]
- §5 vector discipline: [N/A | new vectors added | no mutations]
- §6 shim: [N/A | designed | rejected]
- §7 multi-runtime: [N/A | coordinated | pre-runtime release]
- §8 audit-postgres: [N/A | migration #009 | added]
- §9 decision: [proceed | revise | reject]
- Reviewer: [maintainer name + date]
```

The PR is then unblocked from the §3 gate in
[`CHANGE_REVIEW_CHECKLIST.md`](./CHANGE_REVIEW_CHECKLIST.md).

---

## 12. A note on conservatism

This review is intentionally conservative. The cost of a false
positive (delaying a benign change) is hours. The cost of a false
negative (shipping a replay-breaking change) is the framework's
core value proposition.

When in doubt, classify *up*. A `basis_refinement` mis-classified
as `wire_format` produces a longer release cycle. A `wire_format`
mis-classified as `basis_refinement` produces audit records that
cannot be replayed.

The asymmetry justifies the conservatism.
