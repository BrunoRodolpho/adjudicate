# SOC2 Control Mapping — `@adjudicate/*` framework

**Status:** Control mapping for the post-v1 framework (`@adjudicate/core`
1.3.0, `@adjudicate/conformance` 1.1.0).
**Audience:** Adopters preparing for a SOC2 Type II examination, GRC
teams evaluating the framework for procurement, third-party assessors
producing a control-narrative section.
**Scope:** First-party `@adjudicate/*` packages.

> **Important — what this document is and is not.** This is a *control
> mapping*: it explains how specific framework features satisfy
> specific SOC2 Common Criteria. A SOC2 attestation requires more than
> features — it requires documented policies, evidence collection, a
> defined audit window, and an independent auditor (§5). Treat this
> document as the "design-of-controls" inputs to that process, not as a
> substitute for the process.

---

## 1. Common Criteria mapping (CC series)

The SOC2 Trust Service Criteria divide into Security (mandatory),
Availability, Confidentiality, Processing Integrity, and Privacy. The
Common Criteria (CC1.x–CC9.x) underpin all five. Each entry below maps
a control to the framework feature(s) that bear on it and explains the
mechanism in 2–4 sentences.

### CC6.1 — Logical and physical access controls

**Adjudicate feature:** `CapabilityPlanner` + Taint lattice.

The framework's structural defense against an LLM-driven mutation is
the `CapabilityPlanner` (in `@adjudicate/core/llm`): tools are typed
`READ_ONLY` vs `MUTATING`, and the planner filters the visible tool
list per actor capability. The LLM cannot call a tool it cannot see;
mutating actions flow through `IntentEnvelope` → `adjudicate()` →
typed `Decision`. The Taint lattice (`SYSTEM > TRUSTED > UNTRUSTED`,
ADR-104) is a runtime gate that supplements the static planner — even
if an LLM-emitted envelope reaches the kernel, the taint floor
declared by `Pack.taint.minimumFor(kind)` refuses any input below the
threshold. Together these form a two-layer logical access boundary
specific to LLM-mediated mutations.

### CC6.2 — New user provisioning

**Adjudicate feature:** `admin-sdk` Actor types.

The framework does not provision users — that is the host's auth
boundary (NextAuth, Auth0, OIDC). `@adjudicate/admin-sdk` contributes
typed `Actor` schemas: every adjudication carries an `IntentActor` with
`{id, role?, tenant?}`; every `AuditRecord` records that actor. The
host's provisioning workflow stamps `actor.id`; the framework
guarantees attribution. Evidence: link the host's provisioning log to
the framework's audit trail via `actor.id`.

### CC6.3 — Termination of access

**Adjudicate feature:** `RuntimeContext` kill switch (ADR-103).

Per-tenant kill switches let an operator revoke a tenant's mutation
authority without restart and without affecting other tenants.
`createRuntimeContext({id, killSwitchEnvVar})` mints an isolated
context; `tenantA.killSwitch.set(true, "incident")` halts just tenant
A. Kill switches are seedable from a deployment-specific env var (e.g.,
`IBX_KILL_SWITCH_TENANT_A`) and support `reseedFromEnv()` so the
env-vs-manual precedence rule does not lock out the operator.
Role-level termination is the host's auth boundary; revoking a
credential at that layer prevents the actor from reaching the kernel.

### CC6.6 — Network security

**Adjudicate feature:** TLS 1.3 (hosted), mTLS ingestion.

The framework's wire format is JSON over the adopter's chosen
transport. The framework recommends TLS 1.3 for all transports and
mTLS for service-to-service audit ingestion (console-to-Postgres,
runtime-to-NATS). Specific deployment guidance lives in `docs/ops/`.
The framework's contribution: it ships no transport that bypasses TLS,
and the recommended deployment topology is mTLS-internal.

### CC6.7 — Data transmission

**Adjudicate feature:** TLS 1.3.

Every transport surface the framework exposes (kernel-to-audit-sink,
audit-sink-to-Postgres, admin-sdk-to-console) is wrapped in TLS 1.3 in
the recommended deployment. The framework does not ship credentials or
transport configuration — adopters wire their own TLS termination
(service mesh: Linkerd, Istio; or AWS ALB). Encryption at rest is via
the Postgres backend's transparent encryption (`pgcrypto`, RDS
encryption, or adopter-chosen equivalent).

### CC7.1 — System operations: change detection

**Adjudicate feature:** `MetricsSink` + `AuditSink`.

`MetricsSink` (consumed by ADR-112's OTLP adapter) emits
`recordDecision`, `recordRefusal`, `recordSinkFailure`,
`recordResourceLimit`, `recordShadowDivergence` — a per-decision
telemetry stream that operators wire into existing change-detection
systems. Configuration changes (kill-switch flips, `policy.default`
changes) emit through the same channel. The audit-side `AuditSink`
provides the durable trail backing the metrics signal. Together they
satisfy "change detection" by making every governance-relevant change
visible in two surfaces — hot metrics + durable audit.

### CC7.2 — System monitoring: anomaly detection

**Adjudicate feature:** `@adjudicate/observability` (ADR-112).

ADR-112 ships an OTLP adapter for `MetricsSink` and `LearningSink`,
with stable `SEMCONV` attribute names (`adjudicate.decision.kind`,
`adjudicate.taint`, `adjudicate.policy.version`). Adopters build
anomaly-detection rules on these names — e.g., "alert if
`adjudicate.decision.kind = REFUSE` AND `basis.category = security`
exceeds N/min." Stable names mean alert rules survive framework
upgrades (renaming any attribute is a MAJOR version bump per ADR-105's
closed-vocabulary discipline). `LearningSink` events carry `guardId`
and `planFingerprint`, enabling correlation between a refusal spike
and a specific guard or plan configuration.

### CC7.3 — Incident response

**Adjudicate feature:** Kill switch + `governance_events` log.

The framework's incident-response affordances are: (a) the
`RuntimeContext` kill switch (ADR-103) for immediate authority
revocation per tenant or process-wide, (b) the durable
`governance_events` log (ADR-101 + ADR-111) for post-incident
forensics, (c) replay via ADR-104 `legacyV1ToV2` and ADR-110
conformance harness for verifying which decisions the kernel produced
during an incident window. ADR-111's `auditHash` + `verifyAuditRecord`
ensures the forensic record is tamper-evident. The incident-response
*plan* (escalation paths, customer notification) is an adopter policy
artifact, not a framework feature.

### CC8.1 — Change management

**Adjudicate feature:** ADR discipline + property tests +
`@adjudicate/conformance` (ADR-110).

Three layers: (1) **ADR discipline** — every load-bearing change ships
with an ADR documenting context, decision, alternatives, consequences;
reviewers reject undocumented load-bearing changes. (2) **Property
tests** — `packages/core/tests/kernel/invariants/` encodes 9 invariant
categories (determinism, idempotency, taint floor, etc.) as
`fast-check` properties; changes violating an invariant fail CI. (3)
**Conformance suite** — ADR-110 ships `@adjudicate/conformance`
with `runConformance(pack)` producing a deterministic
`ConformanceReport`; CI runs it on every PR. Together these structure
"authorized, tested, approved, documented" into the contribution
process. Adopters get the benefit via the conformance suite (run on
their own Packs) and ADR transparency (every framework change is
publicly traceable).

### A1.1 — Availability: capacity

**Adjudicate feature:** Postgres partitioning + retention policy.

`@adjudicate/audit-postgres` partitions `governance_events` by month
(the `partition_month` routing key, documented in `docs/ops/`).
Adopters configure retention per
regulatory requirement (e.g., 7 years for financial under SOX,
indefinite for HIPAA). Partitioning keeps query plans bounded as the
table grows. The framework's contribution is a schema designed for
high-volume append + time-windowed query patterns.

### A1.2 — Availability: backup

**Adjudicate feature:** `persistentBufferedSink` + Postgres backup.

ADR-102's `persistentBufferedSink` is a durable replay queue: records
that overflow the in-memory buffer spill to an adopter-supplied
`PersistentSpillStorage` (filesystem JSONL, SQLite, S3-multipart).
Records survive process restart; recovery drains storage FIFO before
the in-memory queue. The `onOverflow` callback is *required* (no
default), forcing adopters to specify behavior explicitly.
Postgres-side backup (WAL archiving, point-in-time recovery) is
adopter-managed.

### A1.3 — Availability: recovery

**Adjudicate feature:** Replay harness.

`legacyV1ToV2` (ADR-104) + `runConformance` (ADR-110) form a
recovery-verification toolkit: an adopter restoring `governance_events`
from backup can re-run the conformance suite against the restored Pack
code and re-adjudicate stored envelopes through replay. Divergence
(different Decision kind, different basis code) surfaces as a replay
report. Adopters codify replay drills as periodic CI jobs
(`docs/ops/`).

### C1.1 — Confidentiality: data classification

**Adjudicate feature:** Taint lattice (ADR-104).

The `Taint` field on every `IntentEnvelope` (`SYSTEM > TRUSTED >
UNTRUSTED`) is a per-intent confidentiality+integrity classifier.
`Pack.taint.minimumFor(kind)` declares the floor per intent kind:
`vacation.approve` requires `TRUSTED` (manager UI only),
`order.confirm_payment` requires `TRUSTED` (provider webhook only),
`vacation.request` accepts `UNTRUSTED` (user input). The taint label
flows into the audit record so post-hoc analysis can identify which
decisions touched UNTRUSTED input. Future field-level `TaintedValue<T>`
(roadmap, `docs/concepts.md §9`) would propagate taint through guard
computations; the current surface is envelope-level only.

### C1.2 — Confidentiality: data handling

**Adjudicate feature:** Audit retention + REWRITE scope.

Two angles: (1) `governance_events` partitioning supports retention
policies aligned to adopter classification — older partitions dropped
per policy. (2) ADR-105's `GuardDescription` `{kind: "rewrite",
mutatesPayloadFields}` declares which fields a REWRITE guard mutates,
making REWRITE-as-redactor a documented pattern (an adopter can write
a guard that REWRITEs `payload.creditCardLast4` from "1234" to "****"
before forwarding). The framework ships the metadata surface that
lets the adopter declare a redaction guard safely.

### PI1.1 — Processing integrity: validity

**Adjudicate feature:** Replay-safe `intentHash` + deterministic
kernel.

`adjudicate(envelope, state, policy)` is pure, sync, deterministic,
total. Given the same inputs, it produces the same Decision.
`intentHash` (ADR-104, sha256 of `(version, kind, payload, nonce,
actor, taint)`) is the stable identity linking an envelope to its
`AuditRecord`. The replay harness re-runs the kernel against stored
envelopes and verifies the same Decision. Processing-integrity
attestation reduces to: "every decision in the audit trail can be
reproduced from its inputs."

### PI1.2 — Processing integrity: completeness

**Adjudicate feature:** ADR-101 one-emit invariant + ADR-102
fail-closed default.

ADR-101's invariant "calling `adjudicateAndAudit` guarantees exactly
one `AuditRecord` emit per call" is the completeness-of-audit claim:
no decision is invisible. ADR-102's fail-closed `multiSink` default
ensures sink failure does not silently lose audit — it propagates to
the executor, which can refuse the underlying intent.

### PI1.3 — Processing integrity: accuracy

**Adjudicate feature:** Closed `BASIS_CODES` + property tests +
conformance.

Basis codes draw from a closed enum (`BASIS_CODES` per category in
`@adjudicate/core`); conformance check `AC-004` (ADR-110) validates
every Pack-emitted basis is drawn from `BASIS_CODES` ∪
`Pack.basisCodes` — no free-string smuggling. Property tests in
`kernel/invariants/` validate the kernel preserves this. Basis codes
are an accurate, structured, machine-readable record of *why* each
decision was made.

### PI1.4 — Processing integrity: timeliness

**Adjudicate feature:** Deadline helpers + DEFER.

`deadlinePromise` in `@adjudicate/runtime` bounds adjudication
latency: a guard or downstream call exceeding `timeoutMs` produces
`kernel_deadline_exceeded` (ADR-107 names the code). DEFER is the
inverse — a first-class async outcome that explicitly acknowledges
non-synchronous flows. Together these formalize timeliness as a
property of the kernel's contract.

### PI1.5 — Processing integrity: authorization records

**Adjudicate feature:** AuditRecord supersession lineage (ADR-111).

`AuditRecord.supersession` records the lineage of related decisions:
`confirmation_resolved` (REQUEST_CONFIRMATION approved),
`defer_resumed` (DEFER woken), `rewrite_executed` (REWRITE ran),
`replay` (historical replay). With `AuditRecord.policyVersion`
(ADR-111) the trail is a complete, ordered record of authorization
events plus the Pack version that produced each.

---

## 2. Other regulations (cross-walk)

The same audit + kernel-purity primitives map to non-SOC2 regulations.
Short cross-walk; expand against the adopter's specific exposure.

**PCI-DSS Requirement 10 (audit trails).** Every mutation crosses the
kernel; one `AuditRecord` per decision (ADR-101); records include
actor, intent, decision, basis, timestamp, supersession, policy +
kernel version, `auditHash` (ADR-111). The framework does not handle
PAN data directly (delegated to Stripe via PaymentElement in
`docs/architecture/decisions.md §11`); the record-keeping primitive
satisfies PCI-DSS 10.x for authorization-decision events.

**HIPAA § 164.312(b) (audit controls).** `AuditRecord` + supersession
lineage record system activity; examination via admin-sdk read +
replay. For ePHI workloads, adopters classify relevant intents at
`TRUSTED` and apply retention aligned to HIPAA's 6-year requirement
(Postgres partitioning supports this).

**ISO 27001 Annex A.12.4 (logging and monitoring).** `AuditRecord` +
Postgres partitioning + ADR-111 `auditHash`. Event logging by-design;
protection via `auditHash` (tamper detect) and the recommended minimal
Postgres role; admin/operator logs flow through the same
`governance_events` table (kill-switch flips, replays, conformance
runs). Clock sync is the host's responsibility (NTP).

**GDPR Article 30 (records of processing).** `AuditRecord` provides
the per-activity record; combined with the adopter's Article 30
register the trail identifies (via `actor.id` + payload schema) which
categories of personal data were processed under which decision. The
Article 30 narrative (lawful basis, recipients, retention) is an
adopter policy artifact.

**EU AI Act Article 12 (record-keeping).** `AuditRecord` (ADR-101) +
Pack versioning (ADR-111). Every decision is recorded with the actor,
the Pack version (policy in force), and the kernel version
(adjudication algorithm in force). Kernel purity + `policyVersion`
mean a regulator can replay any historical decision against the same
Pack and kernel that produced it — the strongest form of "log over
the lifetime of the system."

**EU AI Act Article 14 (human oversight).** ESCALATE +
REQUEST_CONFIRMATION decisions. The kernel's six-Decision algebra
carves out human-in-the-loop outcomes: REQUEST_CONFIRMATION pauses
pending user approval; ESCALATE routes to a supervisor. Pack authors
declare which intents trigger which outcome. Human oversight is a
load-bearing structural primitive of the decision algebra; ADR-105's
closed vocabulary prevents drift toward "ESCALATE-like, but skip the
human" workarounds.

---

## 3. NIST 800-53 cross-walk (selected)

| NIST control | Title | Adjudicate feature |
|---|---|---|
| AC-3 | Access enforcement | CapabilityPlanner + Taint lattice |
| AC-4 | Information flow enforcement | Taint lattice + REWRITE |
| AU-2 | Event logging | AuditRecord (ADR-101) |
| AU-3 | Content of audit records | AuditRecord v4 (ADR-111) |
| AU-9 | Protection of audit information | auditHash + minimal Postgres role |
| AU-12 | Audit record generation | ADR-101 one-emit invariant |
| CM-2 | Baseline configuration | Pack versioning (ADR-111) |
| CM-6 | Configuration settings | Closed BASIS_CODES + closed metadata |
| IR-4 | Incident handling | Kill switch + governance_events |
| SI-4 | System monitoring | MetricsSink + ADR-112 OTLP |
| SI-7 | Information integrity | auditHash (ADR-111) |
| SC-8 | Transmission confidentiality | TLS 1.3 recommended |
| SC-12 | Key management | AuditRecord `signature` seam (adopter-supplied KMS/HSM signer) |
| SC-13 | Cryptographic protection | sha256 in intentHash + auditHash |

---

## 4. Maturity matrix

| Control area | Maturity | Notes |
|---|---|---|
| Audit emission (one per call) | Mature | ADR-101; invariant-tested. |
| Audit fail-closed | Mature | ADR-102; default since T3. |
| Tamper detection (hash) | Mature | ADR-111 `auditHash`; verified via `verifyAuditRecord`. |
| Non-repudiation (signature) | Partial | AuditRecord v4 `signature` field + hash-excludes-signature seam shipped; concrete KMS/HSM signer is adopter-supplied. |
| Per-tenant isolation | Mature | ADR-103. |
| Closed basis vocabulary | Mature | Property-tested via AC-004. |
| Static analysis (Tier 1, metadata) | Mature | ADR-109; CI-integratable SARIF. |
| Static analysis (Tier 2, AST) | Mature | `DEFAULT_TIER2_ANALYZERS` (AJD-201 RewriteScopeAstAnalyzer). |
| Static analysis (Tier 3, coherence) | Mature | `DEFAULT_TIER3_ANALYZERS` (AJD-301 PolicyCoherenceAnalyzer, ADR-125) — planner/Pack coherence, not fuzz. |
| Pack versioning in audit | Mature | ADR-111 `policyVersion`. |
| Distributed kill switch | Partial | ADR-103 single-process; cross-process polling documented but not framework-supplied. |
| OTLP integration | Mature | ADR-112. |
| Codemod-supported deprecations | Mature | ADR-112 `@adjudicate/migrate`. |

---

## 5. What SOC2 attestation requires beyond code

Setting realistic expectations: even a perfect framework cannot, by
itself, produce a SOC2 Type II report. The attestation requires:

**Organizational controls.** Information security policy (written,
dated, approved, reviewed annually); risk assessment (annual exercise
— the threat model is an input, not a replacement); vendor management
(every third-party in the data flow — npm, Postgres, KMS, OTLP
backend — documented assessment + ongoing monitoring); background
checks for personnel with production access; documented
onboarding/offboarding with evidence per employee.

**Operational evidence.** Change tickets (every production change
linked to a ticket with approver — the framework's ADR discipline is
*internal*; the adopter's deployment process still needs its own
tickets); quarterly access reviews with completion evidence; periodic
backup-restoration drills with documented results (the replay harness
is the validation tool; the drill itself is procedural);
incident-response tabletop exercises with learnings; vulnerability
scans on the deployed environment; annual penetration testing.

**Audit window.** SOC2 Type II covers a defined window (commonly 6 or
12 months) during which evidence is collected continuously. The
framework provides a control on day one; the report is not available
until the window closes and the auditor issues an opinion.

**Auditor.** Issued by an independent CPA firm licensed to perform
SOC2 examinations. Selection and engagement is adopter procurement.

**Specifically NOT provided by the framework.** Identity / SSO
(adopter's IdP), encryption at rest (database / storage layer), key
management (the AuditRecord `signature` seam is shipped, but the
concrete KMS/HSM signer is adopter-supplied), physical security (host
provider's SOC2-certified data centers), DDoS protection (CDN / WAF),
secret management (adopter's secrets manager).

---

## 6. Evidence collection guidance

A SOC2 auditor will ask for evidence per control. The mapping between
framework features and *types* of evidence:

| Control | Evidence type | Source |
|---|---|---|
| CC6.1 logical access | CapabilityPlanner config | Adopter's tool definitions |
| CC6.3 termination | Kill-switch flip events | `governance_events` filtered to kill-switch basis codes |
| CC6.6 transmission | TLS config | Adopter's reverse proxy + service mesh |
| CC7.1 change detection | Metrics dashboards | OTLP exporter output |
| CC7.2 monitoring | Alert rules | Adopter's alerting platform |
| CC7.3 incident response | Replay reports | `runReplay(options: ReplayOptions)` over incident-window records |
| CC8.1 change management | ADR set + PR history | Framework repo + adopter PRs |
| A1.2 backup | Postgres backup logs | Adopter's RDS / operator logs |
| A1.3 recovery | Replay drill outputs | Archived per drill |
| C1.1 classification | Taint declarations + audit records | `Pack.taint.minimumFor` source |
| PI1.1 validity | Replay drift reports | Replay harness sample windows |
| PI1.2 completeness | emit-count ≡ decision-count | OTLP metrics |
| PI1.3 accuracy | Conformance reports | Archived per CI run |

---

## 7. Maintenance

Updated alongside ADRs that add controls or modify control narratives.
Adopters preparing for examination should treat this as a *starting
point* for their own control matrix — framework features map to
controls, but the adopter's deployment-specific narrative (their auth
boundary, their TLS termination, their KMS) completes the picture.

Reviewed: 2026-06-10 (reconciled against post-v1 code: `@adjudicate/core`
1.3.0, `@adjudicate/conformance` 1.1.0).
Next review: at every ADR landing under enterprise-hardening
milestones, or per scheduled annual review prior to the adopter audit
window opening.
