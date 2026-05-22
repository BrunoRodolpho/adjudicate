# Failure mode catalogue

> **Status.** Normative for incident triage and degraded-mode operation.
> Enumerates the failure modes the framework anticipates, what each one
> looks like in production, how it manifests in the five health signals,
> and what the documented response is.
>
> Companion to [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) (the per-signal
> triage flow), [`OPERATIONAL_ASSUMPTIONS.md`](./OPERATIONAL_ASSUMPTIONS.md)
> (the assumption stack each failure violates), and
> [`docs/ops/runbooks/`](./runbooks/) (per-incident playbooks).
>
> The catalogue is organised by *system layer*. Each entry has:
> **symptom**, **root cause class**, **detection signal**, **degraded-mode
> contract**, and **recovery path**.

---

## 1. How to use this catalogue

When an incident lands, the operator follows the
[`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) §2 health-signal triage to
identify *which* signal is degraded. Then this catalogue maps the
signal to a *named* failure mode with a documented response.

The named failure modes are the only failures the framework's design
*anticipates*. An incident that does not map to one of these is *novel*
— it should produce a runbook addendum and a new entry in this file.

---

## 2. Kernel layer

### 2.1 Guard panic

- **Symptom**: a Decision with kind `REFUSE` and basis
  `kernel.GUARD_PANIC`. Audit record carries the captured exception
  on `metadata.exception`.
- **Root cause class**: bug in adopter or Pack guard code.
- **Detection signal**: spike in `REFUSE` rate with the
  `kernel.GUARD_PANIC` basis. The operator's dashboard must surface
  basis-code distribution.
- **Degraded-mode contract**: the kernel still returns deterministic
  Decisions; only the affected intent kind refuses. Other intents are
  unaffected.
- **Recovery path**: ADR-106 fail-closed; deploy the Pack fix.

### 2.2 Ledger unavailable

- **Symptom**: `adjudicateAndAudit` throws `LedgerError`; replay-
  suppression is dark.
- **Root cause class**: Redis (or other shared-ledger backend) outage.
- **Detection signal**: `ledger.hit_rate` drops; Redis connection
  errors in the adapter loop.
- **Degraded-mode contract**: with the default `Ledger` interface,
  failure is fail-closed (no decision can be made). The adopter
  chooses whether to keep this default or wrap the ledger in a
  fallback that fails-open (and accepts replay risk). The framework
  does not do this for them.
- **Recovery path**: restore Redis; re-emit any spool-buffered audit
  records via the `persistent-buffered-sink` spool. No state
  corruption — the ledger is idempotent on `intentHash`.

### 2.3 Audit sink unavailable

- **Symptom**: `AuditSink.emit` throws or buffers indefinitely.
- **Root cause class**: Postgres outage, NATS broker unavailable, or
  buffer overflow.
- **Detection signal**: `audit.spill_storage` load → 100 %; sink
  health degraded.
- **Degraded-mode contract**: `persistent-buffered-sink` spools to
  disk; spool plays back when sink recovers. If the spool fills
  before the sink recovers, the configured backpressure policy applies
  (fail-closed by default per ADR-102).
- **Recovery path**: restore the sink, drain the spool, verify
  `replayWithIntegrity` on the recovered window.

---

## 3. Replay / audit-integrity layer

### 3.1 Replay-mismatch spike

- **Symptom**: `replay-drift.ts` returns `regressing` or `flapping`
  with mismatch rate ≥ 1 %.
- **Root cause class**: kernel-version drift (an upgrade landed
  without the additive-only discipline), state-store schema change,
  or Pack policy change that altered basis output.
- **Detection signal**: the replay-drift report's `classification`
  field flips from `stable` to `regressing` or `flapping`.
- **Degraded-mode contract**: the framework continues to run; the
  signal is *informational*. The release that introduced the drift
  is the one to roll back.
- **Recovery path**: identify the version inflection; consult
  [`REPLAY_RISK_REVIEW.md`](../release/REPLAY_RISK_REVIEW.md) for the
  rollback decision matrix.

### 3.2 Integrity verification failure

- **Symptom**: `replayWithIntegrity` reports a non-empty
  `integrityFailures[]` with `kind: "envelope_hash_mismatch"` or
  `"audit_hash_mismatch"`.
- **Root cause class**: tampering, storage corruption, or a buggy
  importer mutating records on ingest.
- **Detection signal**: any non-zero integrity-failure count. This is
  a **P0 security incident** until proven otherwise.
- **Degraded-mode contract**: none. Integrity is a load-bearing
  promise. The framework does not "continue with reduced trust" — it
  reports the failure and lets the operator decide.
- **Recovery path**: forensic — identify the source of the mutation,
  isolate the affected records, restore from backup if available.
  The replay-with-integrity report names the records.

### 3.3 Pre-v4 record replay

- **Symptom**: `replayWithIntegrity` reports `preV4Records.count > 0`
  with `verified: null, reason: "missing_hash"`.
- **Root cause class**: archival records emitted before
  `AUDIT_RECORD_VERSION = 4` (which introduced `auditHash`).
- **Detection signal**: expected on any deployment with pre-v0.7
  history.
- **Degraded-mode contract**: pre-v4 records are *replay-verifiable*
  but not *integrity-verifiable*. The operator runs a Decision
  comparison without the auditHash check.
- **Recovery path**: none required; documented behaviour. Future
  deployments writing v4+ records inherit the integrity layer.

---

## 4. Distributed kill-switch layer

### 4.1 Kill-switch toggle does not propagate

- **Symptom**: kill-switch state changed via the admin path but some
  replicas continue executing intents.
- **Root cause class**: Redis pub/sub miss-delivery, replica clock
  skew, polling fallback delay.
- **Detection signal**: the kill-switch timeline analyser
  (`kill-switch-timeline.ts`) shows non-converged state across
  replicas.
- **Degraded-mode contract**: polling fallback bounds convergence at
  `pollMs * 2` (default 2 s). Within that window, mixed-state
  execution is *expected*.
- **Recovery path**: wait for convergence; if state never converges,
  the polling path is also broken — restart the affected replica.

### 4.2 Kill-switch trip storm

- **Symptom**: rapid sequence of toggle events (>10/sec).
- **Root cause class**: misconfigured admin tool, runaway feedback
  loop, or attack.
- **Detection signal**: governance event rate spike.
- **Degraded-mode contract**: ADR-114 idempotency makes
  same-state-twice a no-op; convergence is unaffected.
- **Recovery path**: locate the source of the toggles; rate-limit at
  the admin endpoint.

### 4.3 Kill-switch boot resync stale

- **Symptom**: a replica boots after a kill-switch toggle and runs
  briefly in the old state.
- **Root cause class**: race between boot and the resync call.
- **Detection signal**: governance event log shows
  `kill_switch.boot_resync` after some decisions were made.
- **Degraded-mode contract**: the window is bounded; the resync
  catches up on first poll cycle.
- **Recovery path**: documented; ensure boot order is
  `EmergencyStore.connect → resync → start serving`.

---

## 5. Park/resume layer

### 5.1 Resume after restart fails to find park record

- **Symptom**: a signal arrives for a parked intent but
  `resumeDeferredIntent` returns "not found".
- **Root cause class**: `ParkStore` lost the record (in-memory store
  used in production by mistake), or TTL expired.
- **Detection signal**: log entries `park_record_not_found`.
- **Degraded-mode contract**: the signal is ignored; no state change.
  The original intent is recorded as `DEFER` with no resume.
- **Recovery path**: switch to `ParkStoreRedis` for durability;
  configure TTL to exceed the longest expected park window.

### 5.2 Parked-envelope hash mismatch on resume

- **Symptom**: `verifyParkedEnvelopeHash` fails on resume.
- **Root cause class**: tampering with the parked record, or schema
  drift in `ParkStore` serialisation.
- **Detection signal**: log entry `parked_hash_mismatch`; behaviour
  depends on `verifyParkedHash` mode (`warn` | `strict` | `off`).
- **Degraded-mode contract**:
  - `strict`: fail-closed; resume refused.
  - `warn`: resume proceeds; warning logged.
  - `off`: no verification (legacy mode).
- **Recovery path**: ADR-114 + the freeze matrix entry for
  `verifyParkedHash`. Tighten to `strict` once adopters have migrated
  legacy blobs.

---

## 6. Pack-ecosystem layer

### 6.1 Pack manifest validation failure

- **Symptom**: `validatePackManifest(pack, manifest)` returns
  diagnostics with `severity: "error"`.
- **Root cause class**: manifest drift from runtime Pack (e.g., basis
  codes declared in manifest not used in code).
- **Detection signal**: CI gate or install-time CLI check.
- **Degraded-mode contract**: install is blocked.
- **Recovery path**: re-emit the manifest from the runtime Pack
  (`adjudicate pack manifest emit`).

### 6.2 Pack signature verification failure

- **Symptom**: `verifyPackTrust(pack, signature, { mode:
  "require_signature" })` returns `verified: false`.
- **Root cause class**: signing key mismatch, tampered Pack, or
  ungated install attempt.
- **Detection signal**: install blocked at the CLI/CI gate.
- **Degraded-mode contract**: in lower modes (`best_effort`,
  `require_fingerprint`) the install can proceed with a logged
  warning. `require_signature` is fail-closed.
- **Recovery path**: rotate the signing key; re-sign the Pack;
  re-publish.

### 6.3 Pack conformance failure

- **Symptom**: `runConformance(pack)` returns a check with
  `status: "fail"`.
- **Root cause class**: Pack-author error (taint policy missing,
  default policy is EXECUTE without opt-in, etc.).
- **Detection signal**: CI gate or pre-publish lint.
- **Degraded-mode contract**: install is blocked in CI; runtime
  permits use but emits a `conformance_failure` audit event.
- **Recovery path**: see [`CHANGE_REVIEW_CHECKLIST.md`](../release/CHANGE_REVIEW_CHECKLIST.md)
  §"Pack PR review".

---

## 7. Release-pipeline layer

### 7.1 `rc-checks.ts` gate failure

- **Symptom**: release-candidate workflow fails on one of the six
  gates (lint, test, version, freeze-matrix, hash vectors, scale
  smoke).
- **Root cause class**: a PR landed on `main` that violates one of
  the gated invariants.
- **Detection signal**: red CI on the `release-candidate.yml`
  workflow.
- **Degraded-mode contract**: release is blocked until the gate
  passes. The framework does not ship an RC that fails its own
  gates.
- **Recovery path**: revert the offending commit; re-run.

### 7.2 NPM publish failure

- **Symptom**: `pnpm publish -r` fails.
- **Root cause class**: NPM_TOKEN expired or rotated; npm registry
  outage; provenance attestation failure.
- **Detection signal**: red CI on `release.yml`.
- **Degraded-mode contract**: previously-published versions remain
  available; the new version is delayed.
- **Recovery path**: see
  [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
  §"Lost release credentials" if the cause is credential rotation.
  Otherwise wait out the upstream outage.

### 7.3 Sigstore attestation failure

- **Symptom**: `actions/attest-sbom@v2` fails after a successful
  publish.
- **Root cause class**: Sigstore unavailable, OIDC issuer claim
  rejected.
- **Detection signal**: red step in `release.yml` after the
  `published == 'true'` gate.
- **Degraded-mode contract**: the package is published; the SBOM
  attestation is missing for that version.
- **Recovery path**: re-run the attestation step; or accept that the
  version lacks an attestation and document the gap. Sigstore is
  *additive*; the package is still usable.

---

## 8. Observability layer

### 8.1 OTLP collector unavailable

- **Symptom**: metrics emission fails or buffers in the sink.
- **Root cause class**: collector outage.
- **Detection signal**: collector-side; framework does not detect it.
- **Degraded-mode contract**: metrics are dropped silently;
  decisions and audit emission are unaffected.
- **Recovery path**: restore the collector; lost metrics are not
  recoverable. This is *Tolerated*: metrics are operational signal,
  not the artefact.

### 8.2 Replay-drift job not running

- **Symptom**: `replay-drift.ts` reports `insufficient_data` forever.
- **Root cause class**: the daily replay cron is not deployed.
- **Detection signal**: dashboard panel for replay-drift is dark.
- **Degraded-mode contract**: drift is undetected. This is an
  *operator omission*, not a framework failure.
- **Recovery path**: deploy the daily replay job per
  [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) §"Daily replay job".

---

## 9. Cross-cutting failure mode: maintainer absent

### 9.1 No active framework maintainer

- **Symptom**: no one is responding to issues, no releases are being
  cut, security advisories accumulating.
- **Root cause class**: institutional. Project entered an
  unmaintained period.
- **Detection signal**: external — adopter or community observation.
- **Degraded-mode contract**: the framework continues to *run*. The
  v1 invariants hold for years without a maintainer; no kernel
  update is required to keep replay deterministic.
- **Recovery path**:
  [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
  §"Maintainer-absent operation" + §"Revival procedure".

### 9.2 Lost release credentials

- **Symptom**: no one with NPM_TOKEN or GitHub repo admin remains.
- **Root cause class**: institutional handoff failure.
- **Detection signal**: a release cannot be cut.
- **Degraded-mode contract**: a fork is the recovery path.
  Previously-published versions remain available indefinitely.
- **Recovery path**:
  [`GOVERNANCE_PLAYBOOK.md`](../release/GOVERNANCE_PLAYBOOK.md)
  §"Lost release credentials" — fork to a new npm scope, publish
  the next version under the new scope, document the lineage in
  `docs/execution/decisions-log.md`. Adopters opt-in.

---

## 10. Reading order for an on-call operator

1. Read [`OPERATOR_GUIDE.md`](./OPERATOR_GUIDE.md) §2 to identify the
   degraded signal.
2. Read the section of this catalogue mapped to that signal.
3. If the symptom matches a documented failure mode, follow the
   recovery path.
4. If the symptom does not match, this is *novel* — open an incident
   in [`docs/execution/incidents.md`](../execution/incidents.md) and
   propose a new entry here once the cause is understood.

The catalogue is not exhaustive by accident — it is exhaustive by
discipline. A novel failure mode that is not documented within a
week of resolution is institutional debt.
