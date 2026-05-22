# Operator guide

> **Status.** Normative. Operator-facing reference for running
> `@adjudicate/*` in production. Companion to
> [`docs/ops/runbooks/`](./runbooks/) (per-incident playbooks),
> [`docs/release/POST_V1_STRATEGY.md`](../release/POST_V1_STRATEGY.md)
> (where the framework is headed), and
> [`docs/architecture/LONG_HORIZON_AUDIT.md`](../architecture/LONG_HORIZON_AUDIT.md)
> (known pressure points).
>
> The audience is the on-call operator triaging an adjudicate-backed
> service at 03:00. Every section ends with a *what to do now* line.

---

## 1. Reading this guide

The guide assumes the operator already knows:

- the kernel returns one of six `Decision.kind` values per intent;
- audit records carry an `auditHash` for tamper detection;
- the kill switch fails closed;
- replay re-derives historical decisions for verification.

If those concepts are new, start with [`docs/concepts.md`](../concepts.md)
first.

---

## 2. The five health signals

When triaging an adjudicate-backed service, these are the five
signals to check, in order.

### 2.1 Kill-switch state

**Question:** Is the kill switch engaged?

**Where to check:** Operator console → "Governance" tab; or
programmatically against `EmergencyStateStore.read()`.

**Interpretation:**
- `normal` → kernel evaluates intents.
- `active` → kernel returns `kernel.kill_switch_engaged` SECURITY REFUSE
  for every intent. No state mutates.

**What to do now:** If unexpected, identify who/what tripped it. Use
`analyzeKillSwitchTimeline()` over the recent event window to spot
storms or sources.

### 2.2 Audit-sink health

**Question:** Are audit records persisting?

**Where to check:** `MetricsSink.recordSinkFailure` rate; the buffered
sink's spill counter; the underlying durable store's write health.

**Interpretation:**
- Zero failures → durable sinks are healthy.
- Failures with `consecutiveFailures > N` → the spill storage is
  carrying the load; investigate the downstream.
- Spill storage at capacity → audit emission is at risk of loss; this
  is a P0 incident.

**What to do now:** Check the buffered-sink spill rate first; if non-
zero, page on the durable sink. Audit emission *must* never lose data
silently.

### 2.3 Ledger / replay-dedup health

**Question:** Is the execution ledger storing intent hashes?

**Where to check:** `Ledger.checkAndRecord` outcome distribution.

**Interpretation:**
- `fresh` outcomes dominate → expected.
- `hit` outcomes growing → either legitimate retries (e.g., webhook
  retransmits) or a bug in the adopter's request pipeline.
- Ledger errors → Redis health or schema-version mismatch.

**What to do now:** If `hit` outcomes spike, sample the `intentHash`
distribution. If clustered around a small set, investigate adopter-
side retries. If distributed, investigate replay attacks.

### 2.4 Replay-drift health

**Question:** Does historical replay still produce the same decisions?

**Where to check:** Daily `replay()` over the last 24h window;
`classifyReplayDrift()` over the per-release-tag history.

**Interpretation:**
- `IDENTICAL` or `BASIS_ONLY` for every record → expected.
- `DECISION_KIND` mismatches → load-bearing regression. Either a Pack
  bug or a kernel bug.
- `REFUSAL_CODE_DRIFT` → a Pack tweaked a refusal code without bumping
  semver. Less severe but tracks adopter pain.

**What to do now:** If drift is non-zero, halt the in-flight Pack
upgrade. The replay invariant is the load-bearing product property;
treat any drift as a release-blocker until classified.

### 2.5 Integrity-failure rate

**Question:** Are audit hashes verifying?

**Where to check:** `replayWithIntegrity()` → `integrityFailures[]`;
`MetricsSink.recordResourceLimit` doesn't cover this — read directly
from the integrity check.

**Interpretation:**
- Zero failures → audit storage is intact.
- `audit_hash_missing` → pre-v4 records, expected for legacy data.
- `audit_hash_mismatch` → tampered record. SECURITY INCIDENT.
- `envelope_hash_mismatch` → envelope tampered post-write. SECURITY
  INCIDENT.

**What to do now:** Any hash mismatch is a P0 incident. Page security
immediately. Quarantine the affected partition; do not modify until
forensics are complete.

---

## 3. Standard incident classes

The kernel exposes a closed taxonomy via `OperationalIncidentClass`
(see [`packages/observability/src/ecosystem-telemetry.ts`](../../packages/observability/src/ecosystem-telemetry.ts)).
Map your operations into this vocabulary so runbooks stay shared.

| Class                              | Severity baseline | Triage entry point                                  |
|---|---|---|
| `kill_switch_storm`                | P1                | Operator console + `analyzeKillSwitchTimeline()`    |
| `kill_switch_split_brain`          | P0                | Operator console + ledger inspection                 |
| `audit_sink_outage`                | P0                | Spill-storage monitoring                             |
| `audit_event_bus_failure`          | P2                | `onBusFailure` reports (best-effort fan-out)         |
| `replay_drift_mass`                | P0                | `classifyReplayDrift()`                              |
| `replay_drift_single`              | P2                | `replayWithIntegrity()` per-record                   |
| `integrity_failure`                | P0                | `replayWithIntegrity()` integrityFailures            |
| `deferred_resume_stuck`            | P1                | Park-key scan + ledger inspection                    |
| `confirmation_token_loss`          | P1                | Confirmation store inspection                        |
| `pack_signature_invalid`           | P0                | `verifyPackTrust()` errors                           |
| `pack_signature_missing`           | P2                | `verifyPackTrust()` policy review                    |
| `rate_limit_threshold_breach`      | P2                | Rate-limit store inspection                          |
| `guard_panic_storm`                | P1                | `MetricsSink.recordResourceLimit` + chaos suite      |
| `shadow_divergence_spike`          | P2                | `MetricsSink.recordShadowDivergence` per-Pack        |

---

## 4. Common triage flows

### 4.1 "All decisions are REFUSE"

Likely causes, in order of probability:

1. **Kill switch engaged.** Check §2.1. If `active`, identify why.
2. **A taint policy mis-classified an intent kind as system-only.**
   Check the audit row's `decision_basis` for `taint:level_insufficient`.
3. **A guard panics on every call.** Check for `kernel.GUARD_PANIC`
   basis on recent records.
4. **A new Pack version flipped its `policy.default` to `REFUSE`
   without intending to.** Compare current Pack hash to the prior
   release.

**What to do now:** Run `explainRecord(latestRecord, registry)` on a
recent REFUSE. The supersession narration + basis list points at the
root cause in one shot.

### 4.2 "Pack v1.2 silently changed behaviour"

Likely root cause:

- A Pack ships a behaviour change without bumping the semver lane.
  This is the load-bearing failure mode `classifyReplayDrift` is
  designed to catch.

**What to do now:** Pin the prior Pack version in lockfile; run
`classifyReplayDrift()` over the release-tag window; file the issue
upstream with the drift report attached.

### 4.3 "AuditEventBus subscribers stopped receiving events"

Likely root cause:

- The bus is best-effort; subscriber drops are documented. Durable
  sinks are unaffected.

**What to do now:** Confirm durable sinks recorded the events. If yes,
reconnect the subscriber via `bridgeAuditSinkToBus` reconfiguration.
If no durable record, investigate the durable sink — that is the P0
incident.

### 4.4 "Replay over historical records is slower than usual"

Likely root cause:

- New AuditRecord versions accumulated; the loader is branching on
  more shapes.
- Historical partition grew past the read-batch size.

**What to do now:** Profile the read partition; tune the
`audit-postgres` query batch size; consider monthly-partition
archival.

### 4.5 "A Pack-author claims their Pack passes runConformance but a new minor failed AC-005"

Likely root cause:

- A new conformance check landed in a MINOR with default-error
  severity (per `SEMVER_GOVERNANCE.md §8`).

**What to do now:** Check the changeset for the framework MINOR that
introduced the check; lower the per-check severity in the adopter's
CI if grace-period is needed; surface to the Pack author with the
diagnostic.

---

## 5. Production-readiness checklist (per deployment)

Before promoting an adjudicate-backed service:

- [ ] `pnpm rc:check` passes against the deployed image.
- [ ] All in-tree Packs pass `runConformance()`.
- [ ] All consumed third-party Packs pass `verifyPackTrust()` with
      policy `require_signature`.
- [ ] AuditSink wired to a durable store (Postgres / NATS / S3); the
      buffered+spill sink in front of it.
- [ ] Ledger wired (Redis recommended; in-memory only for tests).
- [ ] Kill-switch wired (`startDistributedKillSwitch` or v2 pub/sub).
- [ ] Console wired (or programmatic alternative for the AQI surface).
- [ ] Replay job scheduled (daily over recent window, weekly over the
      release-tag window via `classifyReplayDrift`).
- [ ] Operator runbook references `OPERATOR_GUIDE.md §3` for incident
      classification.

---

## 6. Boot-time invariants

The kernel asserts these on `installPack`:

- The Pack's `intents` list is non-empty and unique.
- Every basis code emitted by the Pack appears in
  `BASIS_CODES ∪ Pack.basisCodes`.
- `policy.default` is `REFUSE` (or the adopter explicitly opted in
  to `EXECUTE` via `assertPackConformance({ allowDefaultExecute: true })`).
- Guard evaluation order is `state → taint → auth → business`.
- All declared signals appear in the policy's DEFER guards.

If any of these fails, `installPack` throws. **A throwing
`installPack` at boot is correct behaviour** — the kernel refuses to
operate on a malformed Pack. Page the on-call; do not catch-and-
continue.

---

## 7. Runtime invariants you can rely on

The kernel guarantees:

1. **LLM has zero mutation authority.** Every state mutation crosses
   `adjudicateAndAudit`. Adopter `executor` runs only on EXECUTE.
2. **`adjudicate()` is synchronous and pure.** No clock, no RNG, no
   I/O.
3. **Replay is byte-identical** for the same `(envelope, state,
   policy)` triple.
4. **Throwing guards never propagate.** They become SECURITY REFUSE
   with `kernel.GUARD_PANIC`.
5. **`intentHash` excludes `createdAt`** so retries with re-built
   timestamps still dedup correctly.
6. **AuditRecord is additive** across minor versions; readers branch
   on `record.version`.

Violations of any of these are framework bugs — file them as P0.

---

## 8. Surfaces operators interact with

| Surface                                | Read or write | Notes                                       |
|---|---|---|
| `EmergencyStateStore`                  | Read + Write  | The kill switch.                            |
| `AuditStore`                           | Read          | `@adjudicate/admin-sdk` AQI.                |
| `Ledger`                               | Read          | Outcome distribution + dedup state.         |
| Replay job                             | Read          | Daily / weekly runs of `replay()` +         |
|                                        |               | `replayWithIntegrity()`.                    |
| `apps/console`                         | UI            | Reference operator console (Next.js).       |
| `adjudicate doctor`                    | CLI           | Environment health check.                   |
| `adjudicate replay`                    | CLI           | One-shot replay over a window.              |
| `adjudicate pack verify`               | CLI           | Pack trust verification.                    |

---

## 9. Telemetry and dashboards

The framework provides primitives; dashboards live adopter-side.

### 9.1 Recommended sinks

- `createOtlpMetricsSink` for metrics (Prometheus / Grafana / Datadog
  via OTLP).
- `createOtlpLearningSink` for learning events.
- `createOtlpAuditSpanExporter` for audit-as-spans.
- `createEcosystemTelemetry` for local-first ecosystem snapshots.

### 9.2 Recommended dashboards

Build dashboards that aggregate by these closed-cardinality keys:

- `adjudicate.intent.kind` (Pack-controlled, low cardinality).
- `adjudicate.decision.kind` (6 values).
- `adjudicate.taint` (3 values).
- `adjudicate.adapter.outcome` (5 values).
- `adjudicate.pause.phase` (5 values).
- `adjudicate.kill_switch.state` (2 values).
- `adjudicate.transition.source` (4 values).

Do not aggregate on `adjudicate.intent.hash` — that's per-record and
will blow up cardinality. Use it for trace correlation only.

### 9.3 Recommended alerts

- **P0**: any `audit_hash_mismatch` or `envelope_hash_mismatch` event.
- **P0**: replay-drift `regressing` over 3 consecutive samples.
- **P1**: kill-switch storm class (`stormDensityThreshold` exceeded).
- **P1**: durable sink consecutiveFailures > 3.
- **P2**: shadow-divergence rate > 5% over 1h.
- **P2**: analyzer triage `false_positive` count > N for the same
  diagnostic across the Pack set (signals an analyzer needs tuning).

---

## 10. Common adopter mistakes

### 10.1 Catching `installPack` errors at boot

Don't. A throwing `installPack` means the Pack is malformed. Suppressing
the throw and continuing operates the kernel against an invalid Pack
and will produce wrong decisions.

### 10.2 Wiring `executor` to fire on non-EXECUTE decisions

Don't. The kernel only authorises mutation on EXECUTE. Adopter
executors that fire on ESCALATE, DEFER, or REQUEST_CONFIRMATION
break the security model.

### 10.3 Using `Date.now()` inside a guard

Don't. Guards must be pure. Wallclock comes from `deps.now()` in
`adjudicateAndAudit`. Tests assert byte-identical replay; a wallclock-
reading guard breaks that.

### 10.4 Mutating the Pack object after `installPack`

Don't. `installPack` freezes the Pack. Attempts to mutate throw at
runtime. Pack updates ship as new Pack objects, not in-place mutation.

### 10.5 Reaching into adapter-core's internal modules

Don't. The CLI is the contract; `@adjudicate/adapter-core`'s loop is
the contract. Adapter-internal modules can change in MINORs without
notice.

### 10.6 Aggregating telemetry by `intentHash`

Don't. That's per-record; cardinality is unbounded. Trace correlation
only.

### 10.7 Skipping the freeze-matrix update on a PR

Don't. The matrix is the contract. PRs that touch the public surface
without updating the matrix fail `check:freeze-matrix` in CI.

---

## 11. When to escalate to the framework team

The on-call should reach out to the framework maintainers when:

- A load-bearing invariant (§7) appears to fail.
- `replayWithIntegrity` reports a mismatch the adopter cannot explain.
- A Pack passes `runConformance()` but produces wrong decisions at
  runtime.
- A new operational pattern recurs across multiple incidents — the
  framework may need a new primitive or analyzer.

The framework does not page on adopter-side incidents. The framework
maintains the substrate; adopter ops run the deployment.

---

## 12. Quick reference

| I want to …                                | Use this                                            |
|---|---|
| Re-derive a Decision for an audit row      | `replay()` / `replayWithIntegrity()`                |
| Tell *why* a Decision happened             | `explainRecord(record, DEFAULT_EXPLANATION_REGISTRY)` |
| Tell whether replay is drifting            | `classifyReplayDrift()` over per-release samples    |
| Tell whether a Pack is healthy             | `scorePackHealth()` over the manifest + conformance + trust reports |
| Tell whether the kill switch is misbehaving | `analyzeKillSwitchTimeline()` over the event window |
| Walk a supersession chain                  | `buildSupersessionChains()` over the input set      |
| Capture ecosystem evidence locally         | `createEcosystemTelemetry()` + `serializeEcosystemSnapshot()` |
| Verify a Pack's signature                  | `verifyPackTrust({ policy: "require_signature", … })` |
| Test cross-runtime hash equivalence        | `docs/specs/canonical-hash-vectors.json` + `MULTIRUNTIME_CONFORMANCE.md` |

---

## 13. Stability promise

Every surface in this guide is `frozen` per the [`V1_FREEZE_MATRIX.md`](../release/V1_FREEZE_MATRIX.md).
Behaviour changes within the v1 line follow the semver discipline in
[`semver.md`](../release/semver.md). Operator runbooks built today
will run unchanged through the v1 line.
