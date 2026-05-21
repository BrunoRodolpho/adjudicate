# Shared Responsibility Model — adjudicate

> **M4 compliance document.** The three-column split between Adopter,
> Framework, and Hosted Service. Every controllable risk is on exactly
> one column's plate. Ambiguity in a shared-responsibility model is how
> security incidents turn into mutual blame; this document tries to
> leave nothing in the middle.

---

## 1. The three parties

| Party | Identity | What they ship |
|---|---|---|
| **Adopter** | The team building an LLM-driven product on top of `adjudicate` | Application code, Pack selection, executor wiring, infrastructure (in self-hosted) or configuration (in hosted) |
| **Framework** | The `@adjudicate/*` OSS packages (kernel, Packs, audit-postgres, runtime, observability, etc.) | The kernel's determinism guarantees, the audit record shape, the Pack signing scheme, property-test coverage of invariants |
| **Hosted Service** | `adjudicate.cloud` (post-v1.0) | Operational ownership of the data plane, control plane, durability of audit records, kill-switch fanout, compliance attestations |

In **self-hosted** deployments, the Hosted Service column collapses
into the Adopter column — the adopter owns everything the hosted
service would otherwise own. In **hosted** deployments, the Hosted
Service column is non-empty; the adopter still owns Pack correctness
and executor correctness.

The Framework column is the **same in both modes**. The kernel does
not know whether it is running self-hosted or hosted; it has the same
properties either way.

---

## 2. Master matrix

Each row is a concern. Each cell answers: who owns this risk? Each
"✓" means "this party is the primary owner of the named control."
"—" means "no responsibility on this dimension." Multiple "✓"s mean
shared ownership *along well-defined seams*, which is unpacked in the
sections below.

| Concern | Adopter | Framework | Hosted Service |
|---|:---:|:---:|:---:|
| **Pack correctness** (does the rulebook encode the right business policy?) | ✓ |  |  |
| **Pack code quality** (TypeScript, tests, idiomatic guards) | ✓ |  |  |
| **Pack publication & signing** (private Packs) | ✓ |  | ✓ |
| **First-party Pack correctness** (`pack-payments-pix`, etc.) |  | ✓ |  |
| **Executor correctness** (your code that calls `adjudicateAndAudit`) | ✓ |  |  |
| **Kernel determinism** (`adjudicate()` is pure) |  | ✓ |  |
| **Property-test coverage of kernel invariants** |  | ✓ |  |
| **Replay safety** (records replay to identical decisions) |  | ✓ | ✓ |
| **Audit-record integrity** (`auditHash` per ADR-111) |  | ✓ | ✓ |
| **Audit-record durability** (records persist) | ✓ |  | ✓ |
| **Audit-record tamper detection** (`verifyAuditRecord`) |  | ✓ | ✓ |
| **Compliance attestation: SOC 2 Type 1** |  |  | ✓ |
| **Compliance attestation: SOC 2 Type 2** |  |  | ✓ |
| **Compliance attestation: ISO 27001** |  |  | ✓ |
| **State-store integrity** (your DB, your Redis) | ✓ |  |  |
| **State-store integrity in hosted-managed mode** (CMEK, dedicated cluster) |  |  | ✓ |
| **Encryption at rest** — self-hosted | ✓ |  |  |
| **Encryption at rest** — hosted |  |  | ✓ |
| **Encryption in transit** (TLS 1.3 ingestion gateway) |  |  | ✓ |
| **Encryption in transit** (in-VPC, self-hosted) | ✓ |  |  |
| **Kill-switch declaration** (when to flip) | ✓ |  |  |
| **Kill-switch propagation** (the flip reaches every executor) |  | ✓ | ✓ |
| **DLQ drainage** (records the consumer rejected) |  |  | ✓ |
| **DLQ drainage** (self-hosted) | ✓ |  |  |
| **Pack signing verification on load** |  | ✓ | ✓ |
| **JWKS rotation & key management** |  |  | ✓ |
| **API key safekeeping** | ✓ |  |  |
| **RBAC role assignment** | ✓ |  |  |
| **RBAC enforcement** (the data plane refuses an unauthorized query) |  |  | ✓ |
| **Incident response in the adopter's domain** | ✓ |  |  |
| **Incident response in the hosted infrastructure** |  |  | ✓ |

The "shared" rows are the ones worth walking through in detail. The
sections below name the seam.

---

## 3. Pack correctness

> *Who decides if "refunds over R$1k must ESCALATE" is the right threshold?*

| Adopter | Framework | Hosted |
|---|---|---|
| Decide the policy. Select Packs. Pin versions. | Provide tested Packs with documented behavior. | Distribute signed Packs. |

**The adopter owns the policy.** The framework cannot know whether your
business escalates refunds at R$1k or R$10k — that's a domain question.
What we ship in `@adjudicate/pack-payments-pix` is a reasonable
*template* with clearly-documented thresholds; we expect adopters to
either tune those thresholds or wrap the Pack in their own
PolicyBundle.

The framework's commitment, for first-party Packs:
- Property-test coverage of the **invariants** the Pack claims to hold
  (e.g. "no refund is ever EXECUTEd above the original charge amount").
- A **changelog** that flags any change to default thresholds with the
  `breaking-policy:` prefix so adopters know to re-audit before
  pinning.
- A **policy version** stored in the AuditRecord v4 `policyVersion`
  field (ADR-111) so the adopter can replay historical decisions
  against the Pack as it existed at decision time.

The framework does *not* commit to the **rightness** of any specific
threshold. That is policy, and policy is the adopter's domain.

**Hosted's responsibility** is limited to: signed Pack distribution
(the Pack the adopter pinned is the Pack that runs), pull-through
caching, and per-tenant private Pack publication.

---

## 4. Executor correctness

> *Who is responsible for "the Decision was EXECUTE; did the side-effect actually run, and correctly?"*

| Adopter | Framework | Hosted |
|---|---|---|
| Writes the executor. Implements the side-effects. Handles errors. | Provides the kernel's decision and audit record. | (Not on the hot path.) |

**The adopter owns the executor.** The framework's API
(`adjudicateAndAudit` returning a Decision; the runtime's
`resumeDeferredIntent` for DEFER lifecycles) is *advice* — the adopter's
code is what actually mutates state. If your executor receives
`Decision.outcome = "EXECUTE"` and your domain service throws, the
audit record correctly says "EXECUTE was approved"; whether the
side-effect occurred is a property of your code, not ours.

The framework's commitment here is **predictability**: identical inputs
yield identical Decisions. The executor's commitment is to handle the
six outcomes (EXECUTE / REFUSE / REQUEST_CONFIRMATION / ESCALATE /
REWRITE / DEFER) without silently dropping one.

---

## 5. Kernel determinism and replay safety

> *Who guarantees that replaying a 2026-Q1 record on a 2026-Q4 kernel produces the same decision?*

| Adopter | Framework | Hosted |
|---|---|---|
| Pins `@adjudicate/core` version. Pins Pack versions. | Maintains semver discipline. Records `kernelVersion` per ADR-111. Property-tests determinism per ADR-101, ADR-102. | Resolves the right kernel + Pack version at replay time. |

The framework's determinism story has three load-bearing properties,
each backed by property tests in `packages/core/tests/`:

1. **Same inputs → same Decision.** `adjudicate(env, state, bundle)` is
   pure. Tested against thousands of fuzzed inputs.
2. **Fixed guard order.** State → taint → auth → business → default
   (ADR-104 reorder is the load-bearing soundness property; see
   `docs/concepts.md` §9). Tested by introspection.
3. **Versioned envelopes.** `IntentEnvelope.version` is a closed
   enum; unknown versions REFUSE deterministically. Tested by
   feeding a future version through the kernel and asserting
   `schema_version_unsupported` is the basis.

Replay safety builds on those three. The AuditRecord v4
`kernelVersion` and `policyVersion` fields (ADR-111) let a replay
reader load the kernel and Pack *as they existed at record time*. The
Hosted Service's replay tooling resolves those versions; the OSS
replay tooling (in `@adjudicate/audit`) requires the adopter to
provide the matching versions.

**What the framework does not own:** semantic drift in the adopter's
domain. If your `vacationState.employee.ptoBalanceDays` was 10 at
record time and is 4 at replay time, the replay decision will differ
because the *state* differs. Replay determinism is conditional on
"same envelope, same state, same kernel, same Pack." The adopter's
job is to snapshot enough state at audit time to make replay
meaningful — see the `state` field documentation in
`packages/core/README.md`.

---

## 6. Audit integrity (`auditHash` from ADR-111)

> *Who detects that a stored AuditRecord was tampered with?*

| Adopter | Framework | Hosted |
|---|---|---|
| (Stores the record durably; calls verify on read.) | Provides `verifyAuditRecord`. Computes `auditHash` on emit. | Stores records with the hash. Runs verify on cold-store reads. Surfaces tamper events. |

ADR-111 introduced `auditHash` (sha256 over the canonical record minus
the hash and signature fields) and `verifyAuditRecord` (pure function:
`{verified: true} | {verified: false, reason: "tampered"}`).

- The **framework** owns the *algorithm* — what bytes are hashed, what
  canonical form is used, what verifies as tampered.
- The **hosted service** owns the *persistence* and the *operational
  verification cadence*. Every cold-store read runs `verifyAuditRecord`
  before returning to the caller. A tampered record returns a 500 with
  a security-event log entry.
- The **adopter** owns *their* persistence layer in self-hosted mode.
  `audit-postgres` reads do not auto-verify; that's an explicit
  application-layer call.

The framework does *not* commit to **non-repudiation** without an
`AuditSigner` (a v0.5 add). The hash detects tampering; signing
proves authorship. The hosted service's signed-records feature is
optional per tenant.

---

## 7. Compliance certifications

> *Who holds the SOC 2 report?*

| Adopter | Framework | Hosted |
|---|---|---|
| Inherits the hosted service's certifications for in-scope concerns. Independently certifies their own deployment. | (Not a legal entity; cannot hold certifications.) | Holds the certifications: SOC 2 Type 1 → Type 2 → ISO 27001. |

**The framework cannot be certified.** An OSS library is not a
service; SOC 2 is for services. The hosted service is the legal
boundary that can hold compliance attestations.

The hosted service's roadmap:

| Cert | Target | Notes |
|---|---|---|
| **SOC 2 Type 1** | 6 months after v1.0 hosted GA | Point-in-time controls assessment. The minimum bar for selling to security-conscious mid-market. |
| **SOC 2 Type 2** | 12 months after Type 1 | Continuous controls over a 6–12 month observation period. Required for most regulated industries. |
| **ISO 27001** | ~18 months after Type 2 | Adds international (esp. EU) audience. |
| **HIPAA BAA** | Available on Enterprise pre-cert | Architecture supports it (CMEK, dedicated cluster, audit completeness); BAA execution is per-customer. |
| **FedRAMP / IL4** | Not committed | Dependent on demand; the architecture does not preclude it. |

**Adopter responsibility:** the hosted service's certifications cover
the *hosted service's* controls (their data plane, control plane,
operational practices). The adopter is responsible for their *own*
controls — their executor code, their state stores, their access
practices, their incident response. A SOC 2 Type 2 report from the
hosted service is *evidence* the adopter can present to their auditor,
not a substitute for the adopter's own posture.

---

## 8. State-store integrity

> *Who guarantees that the Postgres holding your domain state is consistent?*

| Adopter | Framework | Hosted |
|---|---|---|
| Operates their own state stores (Postgres, Redis, Mongo, whatever). | Documents what guarantees the kernel relies on (none — kernel is stateless). | Operates the audit state store (Postgres + cold archive). |

The kernel **does not have a state store**. The `state: S` parameter
passed into `adjudicate(env, state, bundle)` is whatever the adopter
hands in — typically the result of a transactional read of their
domain database. The kernel cannot enforce consistency on something it
does not own.

In **hosted** mode, the audit state store is the hosted service's
problem. Postgres replication, partition maintenance, backup
verification, PITR drills — all hosted-service concerns. The adopter
sees a query API and an SLO; the implementation is opaque.

In **self-hosted** mode, all state stores are the adopter's problem.
The framework provides reference adapters (`audit-postgres`, with
migration scripts) but does not commit to operating any persistence
on the adopter's behalf.

---

## 9. Encryption

> *TLS 1.3 in transit, AES-256 at rest. Whose job?*

| Adopter | Framework | Hosted |
|---|---|---|
| TLS for adopter-internal traffic. Encryption at rest for adopter-owned stores. API keys stored as secrets. | Does not handle encryption directly (no I/O). | TLS 1.3 on every external endpoint. AES-256 at rest in Postgres and S3. CMEK on Enterprise. |

**In transit:**
- The ingestion gateway accepts gRPC over **TLS 1.3 only**. Older
  versions are not negotiated. Client cert (mTLS) is enforced.
- Inside the hosted data plane, all service-to-service traffic uses
  mTLS via the service mesh.
- Between adopter and hosted: TLS 1.3 + mTLS + JWT (three independent
  controls; any one of them being broken is not sufficient to forge
  an ingestion request).

**At rest:**
- Hosted Postgres: AES-256 with a per-region KMS-managed key. CMEK
  (customer-managed encryption key) is available on Enterprise — the
  customer brings a KMS key, the hosted service encrypts with it,
  rotation is the customer's call.
- Hosted S3 (cold store): SSE-KMS with the same key. Enterprise CMEK
  applies here too.
- Hosted Redis: keys are short-lived; encryption at rest is provided
  by the underlying managed Redis service.

**Adopter at rest:** In self-hosted, the adopter encrypts their own
storage. We document this expectation in the README of every adapter
package; we do not enforce it (we cannot).

---

## 10. Kill-switch propagation

> *Operator flips the switch; how long until every executor stops?*

| Adopter | Framework | Hosted |
|---|---|---|
| Decides *when* to flip. Operates the kill switch in self-hosted (env var, admin endpoint). | Provides `RuntimeContext.killSwitch` (ADR-103). Defines the kernel-side semantics (REFUSE with `killed_by_operator`). | Fans out the flip globally within SLO (p99 < 30s). Audit-logs the flip. |

ADR-103 split the kill switch into per-tenant `RuntimeContext`
instances precisely so the hosted multi-tenant offering could flip one
tenant without affecting others. The framework owns the
`RuntimeContext` interface and the kernel's REFUSE behavior on a
killed switch.

In **self-hosted**:
- The adopter flips a kill switch via env var (`IBX_KILL_SWITCH`) or
  by calling `RuntimeContext.killSwitch.set(true, reason)`.
- Propagation to other process instances is the adopter's job: a
  Redis pub/sub, a config-reload signal, a deploy. The framework
  provides the `reseedFromEnv()` hook so an env change is observable
  without restart.

In **hosted**:
- The Operator flips via the console or API. The control plane
  publishes to the NATS subject. Region caches update. Per-tenant
  `RuntimeContext` instances poll the cache.
- The SLO (p99 < 30s globally) is a **hosted commitment**, not a
  framework property. The framework's commitment is "if your
  `RuntimeContext` says killed, the kernel refuses with the right
  basis."

---

## 11. DLQ drainage

> *The audit consumer rejected a record; who reads the DLQ?*

| Adopter | Framework | Hosted |
|---|---|---|
| Reads their own DLQ in self-hosted. Decides remediation. | Provides the AuditSink's fail-closed semantics (ADR-102). | Operates the hosted DLQ, alerts on growth, drains during incident response. |

The fail-closed default (ADR-102) means: if the AuditSink cannot
persist a record, the kernel refuses to EXECUTE (the record cannot
later prove what happened). Records that *would have* been emitted
but failed are typically buffered in the broker until they can be
persisted.

A persistent failure (corrupted record, schema-validation reject)
sends the record to a DLQ. Drainage policy:

- **Hosted:** the data plane operates a per-tenant DLQ. Growth alerts
  trigger on-call. The drain is a manual operation (an Operator
  reviews the rejected records, identifies the cause, and either
  fixes the bug or escalates to engineering). DLQ contents are
  visible to the tenant's Auditor role.
- **Self-hosted:** the adopter operates the DLQ. The framework's
  adapters expose hooks (`onDLQ(record, reason)`) but no default
  handler — silence on failure would be worse than no DLQ at all.

---

## 12. Pack signing verification on load

> *Who ensures the Pack you loaded is the Pack you intended?*

| Adopter | Framework | Hosted |
|---|---|---|
| Pins Pack version + content hash. Configures expected signing key. | Verifies signatures at module load. Refuses on signature mismatch. | Distributes signed Packs. Per-tenant signing-key pinning. |

The Pack signing scheme:
- First-party Packs (`@adjudicate/pack-*`) are signed at publish time
  by Anthropic's signing key. The public key is bundled with the
  framework; verification happens in `@adjudicate/core` at Pack
  registration.
- Private Packs (Enterprise-only feature) are signed by the customer's
  KMS key. The expected key fingerprint is pinned in the tenant's
  configuration; the hosted Pack registry refuses to serve a Pack
  whose signature does not match.

The framework's commitment is **verification, not distribution**. The
hosted service's commitment is **distribution with provenance** — the
Pack you pinned and signed is exactly what runs.

An adopter who loads an unsigned Pack via `--allow-unsigned-packs` (a
dev-mode flag) is on their own. Production isolation tiers refuse to
start an executor with that flag set; this is enforced by the hosted
ingestion gateway via a `pack_attestation` claim in the API key.

---

## 13. Worked example — a refund refused in production

A concrete walk-through grounds the matrix. Scenario: an LLM proposes
a R$5,000 refund on a R$3,200 charge. The kernel REFUSEs with
`policy_violation:refund_above_charge_amount`. Who owns what?

| Step | Responsibility | Who |
|---|---|---|
| LLM emits the IntentEnvelope | Adopter (prompt design) |  |
| `adjudicate()` runs the Pack's guards | Framework (kernel) + Adopter (Pack pinning) |  |
| Decision is REFUSE | Framework (deterministic) |  |
| AuditRecord v4 emitted with `auditHash` | Framework (algorithm) |  |
| Record reaches the audit pipeline | Adopter (in self-hosted) / Hosted (in hosted) |  |
| Record persisted, queryable | Adopter / Hosted |  |
| Auditor reads the record next day | Hosted (RBAC, query service) — or Adopter |  |
| Auditor verifies `auditHash` (tamper check) | Framework (`verifyAuditRecord`) |  |
| Auditor traces back the LLM prompt context | Adopter (their prompt logs, not in scope of kernel audit) |  |
| Auditor concludes refund was correctly refused | Adopter (compliance program) |  |

Note what's *not* on the framework: prompt design, prompt logging,
refund-policy thresholds, after-the-fact incident response. The
framework's job is "given this envelope and state, this is what was
decided, and you can prove it wasn't tampered with later." Everything
upstream and downstream is the adopter's or the hosted service's.

---

## 14. ADRs referenced by this document

The shared-responsibility matrix is grounded in concrete framework
commitments documented as ADRs:

- **ADR-101** — kernel audit emission. The kernel always emits a
  record; the AuditSink is a separate concern.
- **ADR-102** — fail-closed default. If the AuditSink cannot persist,
  the kernel refuses.
- **ADR-103** — `RuntimeContext` per-tenant isolation. The seam the
  hosted offering relies on for per-tenant kill switches.
- **ADR-104** — envelope v2 + nonce. The taint-before-auth reorder
  that the determinism story depends on.
- **ADR-105** — guard metadata + closed vocabulary. Bases are not
  arbitrary strings; that's what makes audit aggregation tractable.
- **ADR-106** — guard exception isolation. A buggy guard does not
  corrupt the kernel's decision path.
- **ADR-107** — refusal messages externalization. Audit-friendly
  message catalog; basis codes stay stable across translations.
- **ADR-108** — primitives expansion. The L2 layer the framework is
  building toward; not yet stable surface.
- **ADR-109** — analyze tier 1. Static checks the framework runs on
  Packs at registration.
- **ADR-110** — conformance package. The conformance suite that
  adopters and hosted both run to validate kernel + Pack interop.
- **ADR-111** — AuditRecord v4. The four additive fields
  (`policyVersion`, `kernelVersion`, `auditHash`, `signature`) that
  this document references heavily.
- **ADR-112** — observability migration. The metrics surface that
  hosted dashboards consume.

Every "✓" in the matrix is backed by either an ADR (for framework
commitments) or a hosted-service operational document (for hosted
commitments). Where a row spans two columns, the seam between them is
the contents of the relevant ADR.

---

## 15. What is deliberately not in this model

A few things the shared-responsibility model **does not address**, by
design:

- **LLM provider correctness.** The framework treats LLM output as
  UNTRUSTED by default. Whether Anthropic, OpenAI, or another provider
  hallucinates is irrelevant — the kernel adjudicates the proposed
  intent regardless. The provider is not a party in this model.
- **The adopter's customer's behavior.** The kernel adjudicates
  proposed mutations; what an end user *intends* is between the
  adopter and the user. We do not opine on UX, consent, or
  user-experience patterns above the kernel.
- **Network reliability between adopter VPC and hosted gateway.** This
  is a standard cloud-network concern; the hosted service publishes
  SLOs for *the endpoint*, not for the customer's network path to it.

These omissions are intentional: a shared-responsibility model that
tries to cover every possible failure mode collapses into mush. We
cover the ones that the framework's design directly touches.

---

## 16. Versioning of this document

This document is versioned with the framework. When a future ADR
shifts a responsibility (e.g. introducing `AuditSigner` in v0.5,
which moves "non-repudiation" from "not committed" to a framework-or-
hosted-shared row), this matrix is updated in the same PR.

Adopters reviewing the hosted service for compliance purposes should
treat the **version of this document at the time of their contract**
as canonical for the duration of that contract — we do not unilaterally
shift responsibility post-signing without a contract amendment.
