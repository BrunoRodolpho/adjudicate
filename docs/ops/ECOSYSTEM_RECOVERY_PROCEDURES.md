# Ecosystem recovery procedures

> **Status.** Normative for incident response. Documents the recovery
> path for each named ecosystem-level failure. Each procedure is a
> step-by-step playbook that an operator (or future maintainer) can
> follow without consulting the original authors.
>
> Companion to
> [`FAILURE_MODE_CATALOG.md`](./FAILURE_MODE_CATALOG.md) (failure mode
> taxonomy), [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) (health-signal
> triage), [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
> §"Lost release credentials", and
> [`ECOSYSTEM_ANTI_FRAGILITY.md`](../architecture/ECOSYSTEM_ANTI_FRAGILITY.md)
> (per-dependency anti-fragility plans).
>
> The framework is designed to survive ecosystem-level events that
> render its normal operation impossible. The procedures here are the
> mechanism. Each is opinionated: when in doubt, follow the procedure
> exactly. Do not improvise during an incident.

---

## 1. Posture

Recovery is a different discipline from prevention. The
[`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) prevents incidents. This
document handles the case where prevention has already failed.

Two principles:

1. **Recovery is procedural, not creative.** Improvising during an
   incident produces second-order incidents. Read the procedure;
   execute it.
2. **Recovery preserves invariants.** Even in the worst case, the
   framework's constitutional invariants
   ([`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md))
   must hold post-recovery. A recovery that violates them is a
   *worse* outcome than the original incident.

---

## 2. Replay-corpus recovery

**Trigger.** `replayWithIntegrity` reports widespread
`integrityFailures[]` indicating audit-record tampering or storage
corruption.

**Severity.** P0 security incident.

**Procedure.**

1. **Stop further writes.** Trip the kill-switch to prevent
   additional records from joining a possibly-poisoned corpus.
   ```
   adjudicate ops kill-switch trip --reason "replay-corpus-integrity-incident"
   ```
2. **Quarantine the suspect corpus.** Snapshot the audit-postgres
   tables to a quarantine schema or read-only export.
3. **Identify the inflection point.** Use the integrity report to
   locate the earliest record whose `auditHash` does not re-derive.
   That record's `at` timestamp is the upper bound on the incident
   window.
4. **Determine root cause.** Common candidates:
   - storage corruption (verify with pg_amcheck);
   - hand-edit by a privileged operator (audit pg_stat_activity);
   - bug in an importer (verify migration ordering);
   - hostile action (review access logs).
5. **Reconstruct from a backup.** Restore the audit corpus from a
   timestamped backup *before* the inflection.
6. **Replay forward from backup.** Use
   [`packages/audit/src/replay-integrity.ts`](../../packages/audit/src/replay-integrity.ts)
   to re-validate the restored corpus.
7. **Re-enable writes.** Clear the kill-switch.
8. **Document.** Add an entry to
   [`docs/execution/incidents.md`](../execution/incidents.md) with
   the inflection point, the root cause, and the restoration source.

**Expected duration.** Hours to days, depending on backup retention.

**Pre-requisites.** Backups must exist. If they do not, the corpus
is unrecoverable; document the loss and move forward without it.

---

## 3. Trust-compromise response

**Trigger.** Evidence that a Pack signing key has been compromised,
or that a published `@adjudicate/*` package has a malicious version.

**Severity.** P0 ecosystem incident.

**Procedure.**

1. **Confirm the compromise.** Cross-reference Sigstore Rekor logs
   (if used) with the published versions. Confirm a signature does
   not match the expected signer.
2. **Communicate.** Post advisory on GitHub Security Advisories.
   Notify adopters via the announcement channels listed in
   [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md) §10.
3. **Yank.** Unpublish the compromised version from npm (`npm
   unpublish @adjudicate/<pkg>@<version>`). Note: npm permits
   unpublish only within 72 hours; after that, the version stays
   listed but can be deprecated.
4. **Publish replacement.** Cut a new patch release with the
   legitimate signature; bump the deprecation calendar entry for the
   yanked version.
5. **Rotate signing keys.** If the framework holds signing material,
   rotate. If the compromise is adopter-side, recommend rotation in
   the advisory.
6. **Update trust mode recommendations.** If the incident reveals a
   trust-mode gap, document it in
   [`docs/security/V1-SECURITY-AUDIT.md`](../security/V1-SECURITY-AUDIT.md).
7. **Cross-runtime notification.** If a third-party runtime exists,
   notify maintainers so they can advise their adopters.

**Expected duration.** Hours for advisory + yank; days for new
release + adopter migration.

---

## 4. Provider-removal procedure

**Trigger.** An LLM provider has sunset their API; an adapter
package cannot reach the upstream.

**Severity.** Provider-dependent. The kernel is unaffected; only
the adapter is.

**Procedure.**

1. **Confirm sunset.** Cross-reference the provider's announcement
   + the framework's adapter package's last successful run.
2. **Identify scope.** Which `@adjudicate/<provider>` package is
   affected? Is the provider replaceable?
3. **Update adapter.** If the provider has a successor API, update
   the adapter. If not, archive the adapter package with a
   `@deprecated` notice pointing to the replacement.
4. **Notify adopters.** Add an entry in
   [`docs/release/deprecations.md`](../release/deprecations.md).
   Provide migration guidance: usually, this is "switch to another
   adapter".
5. **Cross-runtime notification.** If a third-party runtime adapter
   exists for the same provider, coordinate the deprecation.

**Expected duration.** Days to weeks. The kernel continues to operate
on records that were already produced.

**Note.** Provider removal does *not* invalidate prior audit
records. The records still replay; only new envelopes are blocked.

---

## 5. Compromised-Pack response

**Trigger.** A Pack consumed by adopters has been compromised — a
malicious update was published.

**Severity.** P0 for affected adopters; P1 for the framework
(reputational).

**Procedure.**

1. **Identify.** Confirm the compromise via `verifyPackTrust` on the
   suspect version. A failing signature, a mismatched fingerprint,
   or an analyzer flag is the trigger.
2. **Notify adopters.** GitHub advisory + announcement channels.
3. **CLI hardening.** Recommend that adopters set `--mode
   require_signature` in the `adjudicate pack verify` CLI to block
   future unverified Packs.
4. **Document.** Add the Pack + version to a public revocation list
   (the framework does not host one, but adopters can maintain their
   own). The framework provides the verification primitive; adopters
   provide the policy.
5. **Replay-classify**. Run `replayWithIntegrity` against historical
   records that targeted the compromised Pack. Verify that audit
   records are *consistent* with the version's published intent
   (i.e., adopters did not unknowingly execute malicious decisions).
6. **Fork or repair.** If the Pack author is unresponsive, an
   adopter (or a community fork) can publish a corrected version
   under a different scope. See
   [`ECOSYSTEM_HEALTH_MODEL.md`](../pack-ecosystem/ECOSYSTEM_HEALTH_MODEL.md)
   §"Why no marketplace" for the decentralised recovery model.

**Expected duration.** Hours for advisory + verification; weeks for
fork.

---

## 6. SEMCONV rollback

**Trigger.** A SEMCONV key was renamed or removed in a release that
should not have happened (MINOR instead of MAJOR).

**Severity.** P1 operational continuity issue.

**Procedure.**

1. **Confirm the regression.** Diff the SEMCONV exports between the
   prior and current versions. The expectation per
   [`WHY_THE_INVARIANTS_EXIST.md`](../architecture/WHY_THE_INVARIANTS_EXIST.md) §8
   is that SEMCONV is *frozen vocabulary* and rename is MAJOR.
2. **Issue patch release.** Restore the renamed/removed key as an
   alias. Mark the new key as the preferred one with a
   `@deprecated` JSDoc on the alias, but ship the alias.
3. **Update freeze matrix.** Document the alias in
   [`V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md).
4. **Update operator guide.** Note the alias in
   [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) if it affects
   dashboards.
5. **Calendar deprecation.** Add to
   [`deprecations.md`](../release/deprecations.md) with a removal
   target ≥ 2 MAJORs out.

**Expected duration.** 1–3 days from detection to patch.

---

## 7. Release rollback

**Trigger.** A release was cut with a regression that affects
adopter production deployments.

**Severity.** P0 for affected adopters.

**Procedure.**

1. **Confirm regression.** Replay test against the prior version
   should pass; current version fails. If it is a security regression,
   coordinate with §3.
2. **Cut a revert release.** This is *not* a `git revert` of main;
   it is a new patch release that publishes the prior known-good
   code. Use `pnpm publish` from a clean tag of the prior version
   with an incremented patch number.
3. **Yank the bad version.** Within 72h via `npm unpublish`;
   afterward via `npm deprecate`.
4. **Publish advisory.** GitHub Security Advisory if the issue is
   security-related; otherwise GitHub Discussions.
5. **Document.** Add to
   [`docs/execution/incidents.md`](../execution/incidents.md). Add
   regression test to prevent recurrence.

**Important.** Do *not* rewrite git history. The bad commit stays in
the log as institutional memory. The fix is forward, not backward.

---

## 8. Ecosystem deprecation

**Trigger.** An entire `@adjudicate/*` package is being retired
(e.g., `@adjudicate/anthropic` because Anthropic sunset the API).

**Severity.** Adopter-dependent.

**Procedure.**

1. **Pre-announce.** GitHub announcement; mailing list. Minimum
   90-day notice for a package retirement.
2. **Mark deprecated.** Add `"deprecated": true` to the package's
   `package.json`; `pnpm publish` issues an npm-level deprecation.
3. **Final release.** Cut a final patch release with the
   deprecation marker and a `README.md` pointing to the replacement.
4. **Calendar retention.** The package remains *installable* from
   npm indefinitely. No yanking; adopters with pinned versions are
   not disrupted.
5. **Update freeze matrix and api-surface.** Note the deprecation.

**Expected duration.** 90 days from announcement to deprecation
marker; indefinite continued availability.

---

## 9. Maintainer-absent operation

**Trigger.** No maintainer has responded in 90 days; security
advisories are accumulating; merged-but-unreleased changesets exist.

**Severity.** Institutional.

**Procedure.**

See [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
§11. Headlines:

1. Existing versions continue to run; adopters are not disrupted.
2. Forks become permitted recovery paths under the licence.
3. A new maintainer revives via the procedure in §11.3.

---

## 10. Lost release credentials

**Trigger.** The maintainer holding NPM_TOKEN or GitHub admin has
departed without handover.

**Severity.** Institutional.

**Procedure.**

See [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
§12. Headlines:

1. Existing versions remain installable; adopters are not disrupted.
2. Org-admin recovery path through npm.
3. Fork-to-new-scope path if recovery fails.

---

## 11. Cross-runtime divergence

**Trigger.** A third-party runtime (Rust/Go/Python) diverges from
the Node reference — same envelope produces a different hash, or
the same `(envelope, state, policy)` produces a different decision.

**Severity.** P0 for cross-runtime adopters.

**Procedure.**

1. **Confirm divergence.** Run the
   [`docs/specs/canonical-hash-vectors.json`](../specs/canonical-hash-vectors.json)
   vectors through both runtimes. The mismatched vector identifies
   the algorithmic divergence.
2. **Identify the canonical truth.** Per
   [`MULTIRUNTIME_CONFORMANCE.md`](../specs/MULTIRUNTIME_CONFORMANCE.md),
   the Node reference + the spec document jointly are the arbiter.
   If they disagree, the spec is normative.
3. **Patch the diverging runtime.** Coordinate with the third-party
   maintainers. Patch their implementation to match the spec.
4. **Verify.** Re-run the vector suite + the longevity corpus.
5. **Document.** Add the divergence and its resolution to
   [`docs/execution/incidents.md`](../execution/incidents.md).

**Expected duration.** Days to weeks depending on third-party
responsiveness.

---

## 12. The post-incident review

Every executed procedure produces a *post-incident review* (PIR):

- **What happened?** Timeline + root cause.
- **What did the procedure do?** Did it work as documented?
- **What needs to change?** Procedure updates, new tests, new
  documentation entries.
- **Who signed off?** Maintainer + date.

PIRs are committed to
[`docs/execution/incidents.md`](../execution/incidents.md). They
are the institutional memory of *how the procedures performed*.

A procedure that performs poorly in a PIR is updated. A procedure
that performs well in a PIR is unchanged but its successful
execution is noted.

---

## 13. The drill

Annual: simulate one of these procedures on a non-production
branch. The drill confirms the procedure still applies and the
maintainer still remembers how to apply it. The procedure to drill
rotates each year so the institution practices all of them within
the multi-year cycle.

The drill is optional but recommended. It is the cheap way to find
procedure rot before an actual incident does.
