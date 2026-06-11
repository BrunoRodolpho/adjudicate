# Replay longevity model

> **Status.** Normative for the v1 line and its multi-MAJOR successor
> line. Defines what *replay* means over a 5–10 year horizon — what is
> guaranteed, what is best-effort, what is out of scope, and how the
> framework's archival discipline preserves the property as
> dependencies, runtimes, and ecosystems evolve.
>
> Companion to [`canonical-json-hash.md`](./canonical-json-hash.md) (the
> normative hash recipe), [`MULTIRUNTIME_CONFORMANCE.md`](./MULTIRUNTIME_CONFORMANCE.md)
> (the cross-runtime equivalence contract), and
> [`docs/release/REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md)
> (per-PR replay-risk checklist).
>
> Replay is the property on which the framework's evidentiary value
> rests. An audit record from year 1 of the v1 line should re-adjudicate
> to the same Decision-kind and basis-set in year 10. This document is
> the explicit definition of "same" and the discipline that preserves it.

---

## 1. Replay defined

For an audit record `R` written at time `T0` against kernel version
`K0`, Pack version `P0`, and state schema `S0`, *replay at time T_n
against kernel `K_n`, Pack `P_n`, state schema `S_n`* is:

```
adjudicate(R.envelope, recovered_state(R, S_n), policy_for(R.packId, P_n))
  → Decision_n
```

Replay produces a `ReplayMismatch` (or `null` for an exact match) by
comparing `Decision_n` against `R.decision`. The per-record classifier
lives in core
([`packages/core/src/replay-classify.ts`](../../packages/core/src/replay-classify.ts),
shared by `@adjudicate/audit`'s `replay()` and admin-sdk's `replay.run`);
the audit-layer harness
[`packages/audit/src/replay.ts`](../../packages/audit/src/replay.ts)
and the integrity layer
[`packages/audit/src/replay-integrity.ts`](../../packages/audit/src/replay-integrity.ts)
wrap it. `classify()` returns `null` on a match, otherwise a
`ReplayMismatch` whose `kind` is the *first* axis of divergence in
priority order:

| `kind` | Meaning |
|---|---|
| `DECISION_KIND` | Decision kind itself changed. **This is a regression on any v1.x replay.** |
| `BASIS_DRIFT` | Decision kind identical; basis flat-set differs (`basisDelta` lists `missing`/`extra`). |
| `REFUSAL_CODE_DRIFT` | Decision kind `REFUSE` on both sides; refusal code changed. |

Two *adjacent* vocabularies live in separate modules and should not be
confused with these per-record kinds:

- **Trend classes** — the replay-drift detector
  [`packages/audit/src/replay-drift.ts`](../../packages/audit/src/replay-drift.ts)
  turns a *series* of `ReplayReport`s into one of
  `stable | improving | regressing | flapping | insufficient_data`
  (see §5.3), answering "is replay quality regressing over time?".
- **Shadow divergence classes** — the boot-time shadow comparator
  [`packages/core/src/kernel/shadow.ts`](../../packages/core/src/kernel/shadow.ts)
  classifies live `adjudicate()` vs legacy-boolean outcomes into
  `NONE | BASIS_ONLY | DECISION_KIND | PAYLOAD_REWRITE`. That is a
  migration-cutover signal, not a replay result.

The longevity model is the framework's commitment about what *should*
be true for each per-record `kind` over the 10-year horizon.

---

## 2. The longevity commitment

A "match" below means `classify()` returned `null`.

### 2.1 Within a MINOR (v1.x.y → v1.x.z)

- **Required**: match for 100 % of records.
- **Forbidden**: `BASIS_DRIFT`, `DECISION_KIND`, `REFUSAL_CODE_DRIFT`
  caused by kernel or Pack changes.

The only acceptable drift within a MINOR cycle is a state-store
recovery quirk (e.g., a row was hand-edited; the record carries the
edit). The framework treats any non-`null` classification as a
release-blocker bug.

### 2.2 Within a MAJOR (v1.x → v1.y)

- **Required**: match or `BASIS_DRIFT` for ≥ 99 % of records.
- **Tolerated**: `BASIS_DRIFT` from documented basis-vocabulary
  refinements (e.g., narrowing a generic basis code into a specific
  one).
- **Forbidden**: `DECISION_KIND` for any audit record.

### 2.3 Across a MAJOR boundary (v1 → v2)

- **Required**: match or `BASIS_DRIFT` for ≥ 95 % of records,
  measured on the *unchanged* sub-corpus (records that target Pack
  versions still supported in v2).
- **Tolerated**: `DECISION_KIND` for records targeting Packs that
  intentionally changed behaviour at the v2 boundary, *provided*
  the Pack ships a v2 release that classifies the historical decision
  via `supersedes`.
- **Forbidden**: silent decision-kind drift (a drift not announced
  in a Pack changelog or the framework's
  [`UPGRADE-PLAYBOOK.md`](../release/UPGRADE-PLAYBOOK.md)).

### 2.4 Decade horizon (year 1 → year 10)

- **Required**: match or `BASIS_DRIFT` for ≥ 90 % of records on
  the unchanged sub-corpus, measured against any kernel release that
  still claims to be in the v1 line.
- The expectation is *not* that 10-year-old records re-adjudicate at
  year 10 *as if no time had passed*; it is that they re-adjudicate
  *truthfully* — i.e., the framework can prove the historical
  decision was lawful under the historical Pack, even from a
  contemporary kernel.

---

## 3. What replay does *not* guarantee

The longevity commitment is bounded by what the framework controls.
It does not promise:

- **State availability.** If the adopter's state store no longer holds
  the state-shape the record presupposes, replay cannot recover it.
  The framework can store the *envelope* (which is replay-immutable)
  but the *state* lives in the adopter's database. Archival of
  state-snapshot fixtures is the adopter's responsibility.
- **Pack availability.** If a Pack has been deleted from npm,
  replay must use a locally archived Pack. A reference
  `scripts/archive-pack.ts` helper is **not yet implemented** (today
  `scripts/` holds only `check-freeze-matrix.ts`, `check-versions.ts`,
  and `rc-checks.ts`); until it exists, adopters archive Pack tarballs
  by their own means. The framework does not host Pack archives.
- **LLM output reproducibility.** The framework explicitly does *not*
  replay the LLM. The envelope is the kernel's input; the LLM's
  output is incidental. Adopters who need LLM reproducibility for
  forensic purposes must record the LLM call separately.
- **Wall-clock equivalence.** A record from year 1 will not produce
  the same `recordedAt` on replay — the clock is current.
  Equivalence is checked on Decision content, not record metadata.

---

## 4. The archival discipline

Replay longevity is operationally a *discipline* about what we
preserve, where, and for how long.

### 4.1 Per-version archive

For every kernel release, the framework preserves:

- The `canonical-hash-vectors.json` file at that version.
- The `intent-envelope-v2.schema.json` at that version.
- The `BASIS_CODES` vocabulary at that version (snapshot in
  `docs/release/api-surface.md`).
- The audit-record schema at that `AUDIT_RECORD_VERSION` (snapshot
  in the same file).
- The golden vectors in `packages/core/tests/hash-golden-vectors.test.ts`.

These artefacts are committed to the repository; the git history is
the archive.

### 4.2 Per-release tag

Every release is tagged in git (`vX.Y.Z`). The tag is the canonical
reference for *what was true* at that version. Replay tooling
parameterised by a tag retrieves the historical contract.

### 4.3 Long-range fixtures

[`docs/specs/replay-longevity-corpus.json`](./replay-longevity-corpus.json)
is the single cumulative corpus file: a curated set of
`(envelopeInput, decision)` fixtures spanning the versions the
framework has shipped, normative for any cross-runtime
re-implementation. The longevity test
[`packages/audit/tests/replay-longevity.test.ts`](../../packages/audit/tests/replay-longevity.test.ts)
loads it, re-adjudicates against the current kernel, and asserts
the longevity commitment.

The corpus grows additively (append-only JSON). A record added at v1.0
is never deleted or mutated; new records are added at v1.x, v2.0, etc.
The longevity test gates the release pipeline.

### 4.4 Cross-runtime vectors

[`docs/specs/canonical-hash-vectors.json`](./canonical-hash-vectors.json)
holds the byte-stable hash vectors that any third-party runtime must
match. Adding a vector is additive (a third-party runtime that
matched the v1.0 vectors continues to match them at v1.5; new vectors
exercise new shapes). Mutating an existing vector is *forbidden*
without a coordinated MAJOR.

A future decision-equivalence vector file
([`docs/specs/canonical-decision-vectors.json`](./canonical-decision-vectors.json),
to be added) will hold `(envelope, state, policy_fixture) → expected_decision`
tuples for cross-runtime kernel parity. See
[`POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md) §"Cross-runtime
expansion" for the trigger.

---

## 5. The replay primitives

The framework ships pure primitives that operationalise replay over the
longevity horizon. All live in `@adjudicate/audit`, except the
per-record `classify()` (in `@adjudicate/core`, see §1).

### 5.1 `replay(records, adjudicator)`

Pure replay: re-adjudicates each record, classifies divergences.
Returns a `ReplayReport` (`{ total, matched, mismatches[] }`).

### 5.2 `replayWithIntegrity(records, adjudicator)`

Adds tamper-detection: re-derives `intentHash` and `auditHash` per
record and reports `integrityFailures[]` independently. Records at the
current `AUDIT_RECORD_VERSION` (5, per
[`packages/core/src/audit.ts`](../../packages/core/src/audit.ts)) carry
an `auditHash` and participate fully; older records lacking it are
counted in the report's `preV4Records` field and skipped for hash
verification. `isReplayIntegrityClean(report)` is the boolean gate.

### 5.3 `classifyReplayDrift(samples, thresholds)`

Trend classifier: takes a series of `ReplayReport`s (per day, per
release, per cohort) and emits a drift summary with a `classification`
of `stable | improving | regressing | flapping | insufficient_data`.
Operators use it to detect drift inflections before they become
incidents. Pure; no clock, I/O, or RNG. Thresholds default via
`DEFAULT_DRIFT_THRESHOLDS` and are adopter-overridable.

### 5.4 `buildSupersessionChains` / `explainSupersessionChainReport`

Replay-aware chain analysis
([`packages/audit/src/supersession-chain.ts`](../../packages/audit/src/supersession-chain.ts)).
`buildSupersessionChains(records)` follows `supersedes` links —
`REQUEST_CONFIRMATION → resolve`, `DEFER → resume`,
`REWRITE → execute`, replay-of-original, and LGPD/GDPR per-surface
scrub — into a `SupersessionChainReport`;
`explainSupersessionChainReport(report)` renders it to a one-line
human summary. Each chain is itself replayable.

---

## 6. The 10-year scenarios

The framework anticipates four kinds of long-range replay scenario.

### 6.1 Regulatory audit

An adopter is audited; the auditor requests "show me that decision
X at date T was lawful per policy P". The adopter retrieves the
audit record, runs `replayWithIntegrity` against the historical
kernel + Pack, and the report matches with zero mismatches. **The
framework's value proposition.**

Longevity contract: as long as the adopter has the historical
kernel binary and Pack version, this works for 10 years. The
adopter is responsible for archiving the binary and the Pack tarball;
the framework keeps the source git tags.

### 6.2 Post-incident forensics

An adopter discovers a misbehaving Pack; investigator reads the
audit records and runs `replay` against the current kernel to
distinguish "the Pack always did this" from "the Pack started doing
this at version X". The replay-drift classifier reveals the
inflection.

Longevity contract: as long as the audit record carries
`policyVersion` and `kernelVersion` (mandatory in the v4+ record
schema; v5 is current), investigators can pinpoint the version
inflection.

### 6.3 Multi-runtime migration

An adopter migrates from the Node reference runtime to a Rust
re-implementation. They run their historical audit corpus through
the Rust runtime; the conformance vectors and decision-equivalence
vectors gate the migration.

Longevity contract: cross-runtime parity is preserved by the vector
files. A Rust runtime at year 5 still matches the year-1 vectors.

### 6.4 Cold-storage revival

An audit record sat in cold storage for 7 years; someone needs to
verify it now. They retrieve the kernel binary at the record's
`kernelVersion`, run `replayWithIntegrity`, and the report matches
with a clean integrity check.

Longevity contract: this works as long as (a) the historical kernel
binary is preserved (adopter responsibility), (b) Node.js still
supports running that binary, and (c) `@noble/hashes` (or its
byte-stable replacement) is installable. The framework's *part* of
the contract is the kernel source code, which lives in git
permanently.

---

## 7. Risk: silent canonicalisation drift

The single highest-leverage risk to longevity is a *silent* change in
canonicalisation behaviour. Examples:

- A future `JSON.stringify` changes number stringification (e.g.,
  emits `100.0` instead of `100`).
- A `String.prototype.localeCompare` is introduced and accidentally
  used for key sort.
- A Unicode database bump shifts NFC normalisation of a particular
  codepoint.

Each would produce different hash values for the same logical input.
The mitigations:

- **Golden vectors** in `canonical-hash-vectors.json` are the canary.
  A future Node release that breaks them is incompatible by
  definition.
- **The Python cross-runtime checker** in
  `canonical-json-hash.md` §"Cross-runtime consumers" produces the
  same hashes from a *different* language stack; agreement is
  evidence of correctness.
- **Long-range fixtures** in `docs/specs/replay-longevity-corpus.json`
  re-test replay across versions; a silent drift would surface as
  classification failures.

The framework does *not* depend on Node releasing without
behavioural change; it depends on the test suite catching the
behavioural change before the release is shipped against. The
longevity test is the gate.

---

## 8. Migration discipline for replay-impacting changes

Any change in the framework that *intentionally* alters replay
behaviour is governed by [`SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md)
§2 and [`REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md).
The headlines:

- **Basis vocabulary refinement** (an existing basis code is split
  into more specific codes): MINOR; replay classifies as
  `BASIS_DRIFT`; the change ships with a `supersedes`-aware migration.
- **Refusal code addition**: MINOR; old records continue to use old
  codes; new decisions use new codes.
- **Decision-kind algebra change**: MAJOR; multi-runtime coordinated
  release; replay-shim for old records.
- **Canonicalisation algorithm change**: MAJOR; new envelope version
  (v3); both v2 and v3 records readable side-by-side; replay tooling
  selects the algorithm per record version.

Any other replay-impacting change is *forbidden* and must be
rejected at PR review.

---

## 9. The longevity test

The longevity test is implemented in
[`packages/audit/tests/replay-longevity.test.ts`](../../packages/audit/tests/replay-longevity.test.ts).
It:

1. Loads the cumulative fixture corpus from
   `docs/specs/replay-longevity-corpus.json`.
2. Rebuilds each fixture's envelope and `AuditRecord` and re-derives
   `intentHash` from the envelope (asserting it against the fixture's
   `expectedIntentHash` when present). The adjudicator under replay is
   a trivial identity function — `() => fixture.decision` — so the test
   isolates the kernel's *canonicalisation and hashing* path rather
   than re-running policy logic.
3. Runs `replayWithIntegrity` over each record.
4. Asserts a clean result: `total` and `matched` equal, zero
   `mismatches`, zero `integrityFailures`, `preV4Records === 0`,
   `isReplayIntegrityClean(report) === true`, and that the record is at
   the current version (`record.version === 5`) with a valid 64-hex
   `auditHash`.
5. Aggregates across the full corpus and asserts the same clean result,
   honouring the longevity commitment per §2.

The test is gated by `rc-checks.ts` and runs on every release. A
failure is a release-blocker.

---

## 10. Multi-decade horizon

Beyond 10 years, the framework's longevity is a function of the
broader software ecosystem more than the framework itself. The
framework's contribution to multi-decade survivability:

- Source in git, in distributed clones, with a permissive licence.
- A normative spec (`canonical-json-hash.md`) in plain English that
  permits implementation from scratch in any future language.
- Cross-runtime vectors that any future implementation can target.
- The replay primitives expressed as pure functions over plain data
  — no framework dependency required to replay.

If, 30 years from now, Node.js is gone but the source and the
canonical-json spec are retrievable, an engineer can re-implement the
kernel in the contemporary language, point it at the historical
audit records, and the replay contract holds. **This is the deepest
form of longevity the framework offers: design for
re-implementability.**

---

## 11. Annual longevity audit

Every year, the framework maintainer (or a designate) performs a
longevity audit:

- [ ] Run the longevity test against the current kernel.
- [ ] Confirm zero `DECISION_KIND` drift on the historical corpus.
- [ ] Verify the cross-runtime vectors still parse under the current
      Python checker.
- [ ] Add at least one new fixture from the prior year of production
      records (anonymised) to the corpus.
- [ ] Update this document if any commitment in §2 has tightened or
      loosened.
- [ ] Sign in [`docs/execution/decisions-log.md`](../execution/decisions-log.md).

The audit is the *only* operational discipline this document
requires. Everything else is encoded in tests and specs.
