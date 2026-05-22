# Maintainer guide

> **Status.** Normative. The operating manual for someone who has just
> become a `@adjudicate/*` maintainer — or is about to become the only
> active maintainer. The framework is governance infrastructure; the
> default state of this codebase should be *quiescent*. New work is
> rare. The job is preservation.
>
> Companion to [`OPERATIONAL_ASSUMPTIONS.md`](./OPERATIONAL_ASSUMPTIONS.md),
> [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md),
> [`FAILURE_MODE_CATALOG.md`](./FAILURE_MODE_CATALOG.md),
> [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md),
> and [`INSTITUTIONAL_RISK_REGISTER.md`](../architecture/INSTITUTIONAL_RISK_REGISTER.md).

---

## 1. What you are inheriting

A frozen, deterministic decision kernel that has been in production
for years. Its public contracts will not change. Its purpose is:

- to remain replayable, audit-verifiable, and provider-neutral;
- to evolve only along the additive paths documented in
  [`EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md);
- to absorb the next decade of ecosystem and runtime change without
  losing the v1 invariants.

Your role is *not* to add features. Your role is to:

1. **Keep the test surface green** (1120+ tests; see §5).
2. **Approve only additive evolution** (§3).
3. **Triage operational incidents** ([`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md)).
4. **Cut releases on demand** (§4).
5. **Reject changes that violate constitutional invariants** (§6).

---

## 2. First 90 minutes

A new maintainer should be able to ship a patch release within 90
minutes of receiving credentials. The order:

1. Read [`AI_CONTEXT.md`](../../AI_CONTEXT.md). It is the senior-engineer
   brief on the system. Then read this file.
2. Read the four constitutional documents in order:
   - [`docs/architecture/decisions.md`](../architecture/decisions.md) (ADR index)
   - [`docs/release/V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md)
   - [`docs/release/EXTENSION_POLICY.md`](../release/EXTENSION_POLICY.md)
   - [`docs/release/SEMVER_GOVERNANCE.md`](../release/SEMVER_GOVERNANCE.md)
3. Run the full test suite locally: `pnpm install --frozen-lockfile &&
   pnpm build && pnpm test`. **Result must be ≥1120 passing.** Any
   deviation is a regression to investigate before doing anything else.
   The `pnpm build` step is required because per-package `tsc --noEmit`
   (run by `pnpm lint`) consumes the `dist/` `.d.ts` files of upstream
   workspace packages — skipping it produces stale-artifact `TS2322`
   errors that masquerade as real regressions. CI runs the steps in
   this exact order; mirror it locally.
4. Run a dry-run release: `pnpm tsx scripts/rc-checks.ts`. The six
   release gates must pass.
5. Read [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md)
   end-to-end. This is the rationale you will repeatedly cite when
   declining proposals.

After step 5 you are competent to review PRs. You are *not* yet
competent to ship a wire-format change — that requires the
multi-runtime co-release discipline in
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §6.

---

## 3. Decision tree for incoming proposals

When a contributor opens a PR or an issue, apply this in order:

```
1. Does it change a `frozen` surface listed in V1_FREEZE_MATRIX.md?
   → Reject. Cite the freeze matrix line.
   (Exception: a coordinated MAJOR cycle is open; see §6.)

2. Does it widen a closed enum (Decision, Taint, RefusalKind,
   BasisCategory, IntentActor)?
   → MAJOR. Open an ADR; co-release across runtimes.

3. Does it introduce a clock, RNG, or I/O inside `adjudicate()`?
   → Reject. Determinism is the v1 promise.

4. Does it add `metadata: Record<string, unknown>` to Decision or
   AuditRecord?
   → Reject. Closed algebra; ADR-104 is the rationale.

5. Does it add an optional field to AuditRecord?
   → MINOR if additive; bump AUDIT_RECORD_VERSION; ship migration.

6. Does it add a new analyzer diagnostic (AJD-2NN+)?
   → MINOR. Allocate the code via docs/architecture/adr/ADR-109.

7. Does it add a new conformance check (AC-NNN)?
   → MINOR. Reserve the AC code; update MULTIRUNTIME_CONFORMANCE.md
   if cross-runtime.

8. Does it change a CI workflow or release gate?
   → ADR required. Cite which invariant the change preserves.

9. Otherwise: bug fix, doc edit, test addition, internal refactor
   that does not alter public behaviour.
   → PATCH. Standard review.
```

The decision tree is mechanical by design. **Editorial debates indicate
either the proposal needs an ADR or the rule needs to be made explicit.**

---

## 4. Release procedure

Releases are pull-driven, not calendar-driven. Cut a release when:

- a changeset has been merged and ≥1 adopter is waiting on it;
- a security fix has been merged; or
- the changeset bot's "Version Packages" PR has been open for >30 days.

### 4.1 Patch / minor release

1. Confirm `main` is green on `ci.yml`.
2. The changesets bot opens a "Version Packages" PR automatically when
   a changeset lands. Merge it.
3. The release workflow publishes to npm with OIDC provenance and
   attaches a Sigstore SBOM. Failures here are diagnosed in
   [`FAILURE_MODE_CATALOG.md`](./FAILURE_MODE_CATALOG.md) §"Release
   pipeline failures".
4. Tag the release on GitHub with the new version. The tag matters for
   the release-candidate workflow's archival; do not skip.

### 4.2 Major release

A MAJOR is a multi-week event. See
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §6 for
the full discipline. The headlines:

- Stage an `-rc` branch and pre-publish each package.
- Run the `release-candidate.yml` workflow; it gates on the six RC
  checks plus cross-runtime hash vectors and replay-integrity
  invariants.
- Coordinate with any third-party runtimes (Rust, Go, Python) to
  release the same wire-format version.
- Publish the `_LONG_TERM_STEWARDSHIP_REPORT.md` update with the
  release.

---

## 5. The test surface

The test posture is **1121 passing, 1 skipped (audit-postgres
live-DB), 0 failing**. The 1 skipped test is gated on a live Postgres
instance; the maintainer should confirm it passes locally with
`POSTGRES_URL=…` before any change to `audit-postgres`.

### 5.1 Where to look first when a test fails

| Failure pattern | First place to look |
|---|---|
| Hash golden vector failure | `packages/core/src/hash.ts` — did canonicalisation change? |
| Invariant property test failure | `packages/core/tests/kernel/invariants/` — read the failing seed |
| Conformance test failure | `packages/conformance/src/checks/` — which AC failed? |
| Replay-determinism failure | `packages/audit/src/replay.ts` + `replay-integrity.ts` |
| Adapter-loop integration failure | `packages/adapter-core/src/loop.ts` |

### 5.2 Tests you must NEVER edit to make pass

These are the load-bearing assertions. If they fail, the code is
wrong, not the test:

- `packages/core/tests/hash-golden-vectors.test.ts`
- `packages/core/tests/kernel/invariants/*.property.test.ts`
- `packages/conformance/src/checks/*.ts` (and their tests)
- `packages/audit/tests/replay-*.test.ts`
- `docs/specs/canonical-hash-vectors.json` (consumed by the
  cross-runtime test)

If you find yourself editing the *expected* hash to match a new
output, **stop and read [`REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md)**.

---

## 6. Constitutional invariants — the things you cannot change

Eleven properties are *constitutional*. They are not "best practice";
breaking them ends the project. They are documented exhaustively in
[`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md).
The headlines:

1. Closed Decision algebra (six values).
2. Replay determinism (no clock, no RNG, no I/O in `adjudicate()`).
3. Canonical hashing (RFC 8785 JCS + SHA-256, byte-stable).
4. Audit immutability (records are values; sinks append only).
5. Fail-closed semantics (throwing guard → SECURITY REFUSE).
6. Provider neutrality (kernel does not know about Anthropic/OpenAI).
7. Semantic-convention stability (SEMCONV keys are frozen vocabulary).
8. Wire-format stability (IntentEnvelope v2; new shape = new version).
9. Pack isolation (Packs cannot reach into each other's policy state).
10. Deterministic guard ordering (state → taint → auth → business → default).
11. Trust verification semantics (verifyPackTrust is pure and local).

A proposal that touches any of these is a coordinated MAJOR or a
rejection. **No grey zone.**

---

## 7. The forbidden-change ledger

These were considered and rejected. Future maintainers will be
proposed them again; the rejection rationale is:

- **Decision.metadata bag** — converts a closed enum into an open one;
  destroys analyzer guarantees. ADR-104.
- **Decision.confidence field** — implies probabilistic semantics the
  kernel does not have; couples policy authors to a numeric scale.
- **Plan.forbiddenConcepts** — typed slot that promised security
  enforcement the kernel never delivered. Removed in v0.5; do not
  reintroduce.
- **YAML/JSON Pack DSL** — Packs are TypeScript; metadata is the
  declarative layer. A DSL adds parser surface without expressive gain.
- **Framework-issued signing CA for Packs** — centralises trust;
  inverts ecosystem-health model.
- **AI-driven governance automation** — non-deterministic; cannot be
  in the trust path.
- **Runtime plugin containers** — invites dynamic mutation; breaks
  determinism.
- **Hosted-by-framework registry** — see ECOSYSTEM_HEALTH_MODEL.md §2.

When declining one of these, cite the relevant ADR or section. Do not
re-litigate.

---

## 8. Working with AI-agent contributors

The codebase is AI-agent-readable by design.
[`AI_CONTEXT.md`](../../AI_CONTEXT.md) is the senior-engineer brief.
When reviewing an AI-generated PR:

- Verify the diff against `INSTITUTIONAL_RISK_REGISTER.md` §6 (closed
  enums) and §3 (provider assumptions).
- Run the full property-test suite, not just the affected package.
- Read the changeset; if the semver classification is wrong, push
  back with the decision tree in §3.

AI-generated work is *welcome* in: bug fixes, documentation, test
additions, codemod authoring, analyzer diagnostics. It is *suspect*
in: invariant-touching code, wire-format edits, hash recipe changes.
Suspect work demands a human re-review of every line, not a
diff-stat check.

---

## 9. Maintainer turnover

The project survives maintainer turnover by encoding intent in tests,
ADRs, and rationale documents. Concrete handoff checklist:

- [ ] Outgoing maintainer signs the
      [`docs/execution/decisions-log.md`](../execution/decisions-log.md)
      with date and bus-factor entries (which knowledge concentrated on
      them; what is now encoded).
- [ ] NPM token rotated to incoming maintainer.
- [ ] GitHub repository admin transferred or shared.
- [ ] Sigstore + OIDC issuer claim verified for incoming account.
- [ ] Annual review of `INSTITUTIONAL_RISK_REGISTER.md` scheduled.

If there is no incoming maintainer (the bus factor went to zero), see
[`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
§"Maintainer-absent operation". The framework is designed to remain
operationally trustworthy in that state for years before a
revival.

---

## 10. What "good" looks like a year from now

- Test count unchanged or up by a small margin (additive coverage of
  new diagnostics or conformance checks).
- Public API surface unchanged or extended additively.
- ADR count up by 0–3 (only architectural decisions earn ADRs).
- No CI workflow changes that did not pass an ADR.
- No mutations to golden hash vectors.
- No `node:crypto.createHash` reintroductions.
- No `Date.now()` inside `packages/core/src/kernel/`.
- `INSTITUTIONAL_RISK_REGISTER.md` reviewed; mitigation column
  unchanged except where a new artefact landed.

A year of *quiescence* is a year of success. The framework is not a
product. It is a *substrate*.
