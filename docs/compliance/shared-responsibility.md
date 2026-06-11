# Shared Responsibility Model — adjudicate

> **Compliance document.** The three-column split between Adopter,
> Framework, and Hosted Service. Every controllable risk is on exactly
> one column's plate. Ambiguity in a shared-responsibility model is how
> security incidents turn into mutual blame; this document tries to
> leave nothing in the middle.
>
> The Hosted Service column describes the planned `adjudicate.cloud`
> offering (post-v1.0) and is **roadmap**, not shipped surface. The
> Adopter and Framework columns describe the current OSS code.

---

## 1. The three parties

| Party | Identity | What they ship |
|---|---|---|
| **Adopter** | The team building an LLM-driven product on top of `adjudicate` | Application code, Pack selection, executor wiring, infrastructure (self-hosted) or configuration (hosted) |
| **Framework** | The `@adjudicate/*` OSS packages (`core`, the `pack-*` Packs, `audit`/`audit-postgres`, `runtime`, `conformance`, `observability`, etc.) | The kernel's determinism guarantees, the audit-record shape, the Pack-trust scheme, property-test coverage of invariants |
| **Hosted Service** | `adjudicate.cloud` (post-v1.0, planned) | Operational ownership of the data plane, control plane, durability of audit records, kill-switch fanout, compliance attestations |

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

Each row is a concern. Each cell answers: who owns this risk? A "✓"
means "this party is the primary owner of the named control"; "—"
means "no responsibility on this dimension." Multiple "✓"s mean shared
ownership *along well-defined seams*, unpacked in the sections below.

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
| **Audit-record integrity** (`auditHash`, ADR-111) |  | ✓ | ✓ |
| **Audit-record durability** (records persist) | ✓ |  | ✓ |
| **Audit-record tamper detection** (`verifyAuditRecord`) |  | ✓ | ✓ |
| **Compliance attestation: SOC 2 Type 1 / Type 2 / ISO 27001** |  |  | ✓ |
| **State-store integrity** (your DB, your Redis) | ✓ |  |  |
| **State-store integrity in hosted-managed mode** (CMEK, dedicated cluster) |  |  | ✓ |
| **Encryption at rest** — self-hosted | ✓ |  |  |
| **Encryption at rest** — hosted |  |  | ✓ |
| **Encryption in transit** — hosted ingestion gateway (TLS 1.3) |  |  | ✓ |
| **Encryption in transit** — in-VPC, self-hosted | ✓ |  |  |
| **Kill-switch declaration** (when to flip) | ✓ |  |  |
| **Kill-switch propagation** (the flip reaches every executor) |  | ✓ | ✓ |
| **DLQ drainage** — self-hosted | ✓ |  |  |
| **DLQ drainage** — hosted |  |  | ✓ |
| **Pack-trust verification on load** |  | ✓ | ✓ |
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
`@adjudicate/pack-payments-pix` ships a reasonable *template* with
documented thresholds; adopters either tune those thresholds or wrap
the Pack in their own policy.

The framework's commitment, for first-party Packs:

- Property-test coverage of the **invariants** the Pack claims to hold
  (e.g. "no refund is ever EXECUTEd above the original charge amount").
- A **changelog** that flags any change to default thresholds so
  adopters know to re-audit before pinning.
- A **policy version** stored in the AuditRecord `policyVersion` field
  (v4+, ADR-111) so the adopter can replay historical decisions
  against the Pack as it existed at decision time.

The framework does *not* commit to the **rightness** of any specific
threshold. That is policy, and policy is the adopter's domain.

**Hosted's responsibility** is limited to: signed Pack distribution
(the Pack the adopter pinned is the Pack that runs), pull-through
caching, and per-tenant private Pack publication.

---

## 4. Executor correctness

> *The Decision was EXECUTE; did the side-effect actually run, and correctly?*

| Adopter | Framework | Hosted |
|---|---|---|
| Writes the executor. Implements the side-effects. Handles errors. | Provides the kernel's decision and audit record. | (Not on the hot path.) |

**The adopter owns the executor.** The framework's API
(`adjudicateAndAudit` returning a `Decision`; `@adjudicate/runtime`'s
`resumeDeferredIntent` for DEFER lifecycles) is *advice* — the
adopter's code is what actually mutates state. If your executor
receives `Decision.kind === "EXECUTE"` and your domain service throws,
the audit record correctly says "EXECUTE was approved"; whether the
side-effect occurred is a property of your code, not ours.

The framework's commitment here is **predictability**: identical inputs
yield identical Decisions. The executor's commitment is to handle the
six `Decision.kind` outcomes (`EXECUTE` / `REFUSE` / `ESCALATE` /
`REQUEST_CONFIRMATION` / `DEFER` / `REWRITE`) without silently dropping
one. See `packages/core/src/decision.ts`.

---

## 5. Kernel determinism and replay safety

> *Who guarantees that replaying a 2026-Q1 record on a 2026-Q4 kernel produces the same decision?*

| Adopter | Framework | Hosted |
|---|---|---|
| Pins `@adjudicate/core` version. Pins Pack versions. | Maintains semver discipline. Records `kernelVersion` (ADR-111). Property-tests determinism. | Resolves the right kernel + Pack version at replay time. |

The framework's determinism story has three load-bearing properties,
each backed by property tests in `packages/core`:

1. **Same inputs → same Decision.** `adjudicate(env, state, bundle)` is
   pure. Fuzzed against thousands of inputs.
2. **Fixed guard order.** State → taint → auth → business → default
   (the taint-before-auth reorder is the load-bearing soundness
   property; ADR-104). Tested by introspection.
3. **Versioned envelopes.** `IntentEnvelope.version` is a closed enum;
   unknown versions REFUSE deterministically with
   `schema_version_unsupported`.

Replay safety builds on those three. The AuditRecord `kernelVersion`
and `policyVersion` fields (v4+, ADR-111) let a replay reader load the
kernel and Pack *as they existed at record time*. Hosted replay
tooling resolves those versions; the OSS replay path
(`@adjudicate/audit-postgres` `replay.ts`) requires the adopter to
provide the matching versions.

**What the framework does not own:** semantic drift in the adopter's
domain. Replay determinism is conditional on "same envelope, same
state, same kernel, same Pack" — if the `state: S` you pass differs at
replay time, the decision differs. The adopter's job is to snapshot
enough state at audit time to make replay meaningful.

---

## 6. Audit integrity (`auditHash`, ADR-111)

> *Who detects that a stored AuditRecord was tampered with?*

| Adopter | Framework | Hosted |
|---|---|---|
| Stores the record durably; calls verify on read. | Provides `verifyAuditRecord`. Computes `auditHash` on emit. | Stores records with the hash. Runs verify on cold-store reads. Surfaces tamper events. |

ADR-111 introduced the v4 `auditHash` — `sha256Canonical` over the
canonical record minus the `auditHash` and `signature` fields (and,
v5+, minus `metadata`, which is attachable post-emission and so
excluded from the pre-image; ADR-124). `verifyAuditRecord`
(`packages/core/src/audit.ts`) is a pure function returning a four-way
result:

- `{ verified: true }` — hash matches; record intact.
- `{ verified: false, reason: "tampered", derived, stored }` — the
  `auditHash` over the whole record no longer matches.
- `{ verified: false, reason: "envelope_intent_mismatch", derived,
  stored }` — `envelope.intentHash` does not re-derive from the
  envelope's content-addressed fields (a forged or drifted envelope
  hash). Distinct from `tampered`.
- `{ verified: null, reason: "missing_hash" }` — a pre-v4 record with
  no `auditHash`; tamper verification is not applicable.

Ownership:

- The **framework** owns the *algorithm* — what bytes are hashed, the
  canonical form, what counts as tampered.
- The **hosted service** owns the *persistence* and the *operational
  verification cadence*: every cold-store read runs `verifyAuditRecord`
  before returning; a tampered record returns a 500 with a
  security-event log entry.
- The **adopter** owns *their* persistence in self-hosted mode.
  `@adjudicate/audit-postgres` reads do **not** auto-verify — that is
  an explicit application-layer call.

The framework does *not* commit to **non-repudiation** in the OSS
default. The `signature` field exists in the record (v4+) and is
persisted (`signature_jsonb`), but it is `null` unless an `AuditSigner`
is wired (see §16). The hash detects tampering; a signature would
prove authorship.

---

## 7. Compliance certifications

> *Who holds the SOC 2 report?*

| Adopter | Framework | Hosted |
|---|---|---|
| Inherits the hosted service's certifications for in-scope concerns. Independently certifies their own deployment. | (Not a legal entity; cannot hold certifications.) | Holds the certifications: SOC 2 Type 1 → Type 2 → ISO 27001. |

**The framework cannot be certified.** An OSS library is not a service;
SOC 2 is for services. The hosted service is the legal boundary that
can hold compliance attestations.

The hosted service's roadmap:

| Cert | Target | Notes |
|---|---|---|
| **SOC 2 Type 1** | 6 months after v1.0 hosted GA | Point-in-time controls assessment. The minimum bar for security-conscious mid-market. |
| **SOC 2 Type 2** | 12 months after Type 1 | Continuous controls over a 6–12 month observation period. Required for most regulated industries. |
| **ISO 27001** | ~18 months after Type 2 | Adds international (esp. EU) audience. |
| **HIPAA BAA** | Available on Enterprise pre-cert | Architecture supports it (CMEK, dedicated cluster, audit completeness); BAA execution is per-customer. |
| **FedRAMP / IL4** | Not committed | Dependent on demand; the architecture does not preclude it. |

**Adopter responsibility:** the hosted service's certifications cover
the *hosted service's* controls. The adopter is responsible for their
*own* controls — executor code, state stores, access practices,
incident response. A SOC 2 Type 2 report from the hosted service is
*evidence* the adopter can present to their auditor, not a substitute
for the adopter's own posture.

---

## 8. State-store integrity

> *Who guarantees that the Postgres holding your domain state is consistent?*

| Adopter | Framework | Hosted |
|---|---|---|
| Operates their own state stores (Postgres, Redis, etc.). | Documents what the kernel relies on (nothing — kernel is stateless). | Operates the audit state store (Postgres + cold archive). |

The kernel **does not have a state store**. The `state: S` parameter
passed into `adjudicate(env, state, bundle)` is whatever the adopter
hands in — typically the result of a transactional read of their domain
database. The kernel cannot enforce consistency on something it does
not own.

In **hosted** mode, the audit state store is the hosted service's
problem (replication, partitioning, backup verification, PITR drills).
The adopter sees a query API and an SLO.

In **self-hosted** mode, all state stores are the adopter's problem.
The framework provides reference adapters (`@adjudicate/audit-postgres`,
with migration scripts) but does not operate any persistence on the
adopter's behalf.

---

## 9. Encryption

> *TLS 1.3 in transit, AES-256 at rest. Whose job?*

| Adopter | Framework | Hosted |
|---|---|---|
| TLS for adopter-internal traffic. Encryption at rest for adopter-owned stores. API keys stored as secrets. | Does not handle encryption directly (no I/O). | TLS 1.3 on every external endpoint. AES-256 at rest. CMEK on Enterprise. |

**In transit (hosted):**

- The ingestion gateway accepts traffic over **TLS 1.3 only**; older
  versions are not negotiated. Client cert (mTLS) is enforced.
- Inside the data plane, all service-to-service traffic uses mTLS.
- Adopter↔hosted is TLS 1.3 + mTLS + JWT — three independent controls;
  breaking any one is not sufficient to forge an ingestion request.

**At rest (hosted):**

- Postgres: AES-256 with a per-region KMS-managed key. CMEK
  (customer-managed) available on Enterprise; rotation is the
  customer's call.
- Cold-store S3: SSE-KMS with the same key; Enterprise CMEK applies.
- Redis: short-lived keys; encryption at rest provided by the managed
  Redis service.

**Adopter at rest (self-hosted):** the adopter encrypts their own
storage. We document this expectation in each adapter's README; we
cannot enforce it.

---

## 10. Kill-switch propagation

> *Operator flips the switch; how long until every executor stops?*

| Adopter | Framework | Hosted |
|---|---|---|
| Decides *when* to flip. Operates the kill switch in self-hosted (env var, control call). | Provides the `RuntimeContext.killSwitch` seam (ADR-103, ADR-114). Kernel REFUSEs with `killed_by_operator`. | Fans out the flip globally within SLO. Audit-logs the flip. |

`RuntimeContext` is per-tenant (ADR-103) precisely so a hosted
multi-tenant offering can flip one tenant without affecting others. The
framework owns the `RuntimeContext` interface and the kernel's REFUSE
behavior on a killed switch.

In **self-hosted**:

- The adopter flips via the `IBX_KILL_SWITCH` env var (tenant contexts
  read `IBX_KILL_SWITCH_<TENANT>`) or by calling
  `RuntimeContext.killSwitch.set(true, reason)`.
- Propagation across process instances is the adopter's job (Redis
  pub/sub, config-reload, a deploy). The framework provides
  `reseedFromEnv()` so an env change is observable without restart
  (`packages/core/src/kernel/runtime-context.ts`).

In **hosted**:

- The Operator flips via the console or API; the control plane fans
  the change out and per-tenant `RuntimeContext` instances pick it up.
- The propagation SLO is a **hosted commitment**, not a framework
  property. The framework's commitment is "if your `RuntimeContext`
  says killed, the kernel refuses with the right basis."

---

## 11. DLQ drainage

> *The audit consumer rejected a record; who reads the DLQ?*

| Adopter | Framework | Hosted |
|---|---|---|
| Reads their own DLQ in self-hosted. Decides remediation. | Provides the AuditSink's fail-closed semantics (ADR-102) and an `onError` hook. | Operates the hosted DLQ, alerts on growth, drains during incident response. |

The fail-closed default (ADR-102) means: if the AuditSink cannot
persist a record, the kernel refuses to EXECUTE (the record could not
later prove what happened). Records that would have been emitted but
failed are typically buffered until they can be persisted.

A persistent failure (corrupted record, schema-validation reject) goes
to a DLQ. Drainage policy:

- **Hosted:** the data plane operates a per-tenant DLQ; growth alerts
  page on-call; the drain is a manual Operator review. DLQ contents
  are visible to the tenant's Auditor role.
- **Self-hosted:** the adopter operates the DLQ. The reference sink
  exposes an `onError(err, record)` callback
  (`PostgresSinkOptions.onError`) so a circuit breaker or alert can
  fire upstream — but ships no default handler, because silent failure
  would be worse than no DLQ at all.

---

## 12. Pack-trust verification on load

> *Who ensures the Pack you loaded is the Pack you intended?*

| Adopter | Framework | Hosted |
|---|---|---|
| Selects a trust policy. Pins fingerprint/signing key. | Provides `verifyPackTrust` (fingerprint + signature). Enforces the chosen policy. | Distributes signed Packs. Per-tenant key pinning. |

Pack trust is a **policy**, not a boolean. `verifyPackTrust`
(`packages/conformance/src/pack-trust.ts`, ADR-115) takes one of four
modes:

| Policy | Permits unsigned Packs? | Use |
|---|---|---|
| `none` | yes | trust everything (test only) |
| `best_effort` | yes | print fingerprint, never fail (the **default**) |
| `require_fingerprint` | yes | the loaded Pack's fingerprint must match a pinned value |
| `require_signature` | **no** | an Ed25519 / RSA-PSS signature over the fingerprint must verify against a supplied public key |

The signature is over the Pack **fingerprint**
(`computePackFingerprint` — a `sha256` of the declarative subset: id,
version, contract, intents, signals, basisCodes), not the raw bytes,
so a rebuild from source produces the same signed fingerprint. The CLI
surfaces this via `adjudicate pack verify --policy <mode>`
(`packages/cli/src/bin.ts`, `packages/cli/src/commands/pack-verify.ts`);
`--policy` defaults to `best_effort`. There is **no** dev-mode boolean
that bypasses verification — "permit unsigned Packs" is exactly the
`none` / `best_effort` / `require_fingerprint` policies (see
`docs/ops/OPERATIONAL_ASSUMPTIONS.md` §9.2).

The framework's commitment is **verification**. The hosted service's
commitment is **distribution with provenance** — the Pack you pinned
under `require_signature` is exactly what runs.

An adopter who runs `none` / `best_effort` in production is on their
own; pinning `require_signature` with a managed key is the production
posture. `verifyPackTrust` is pure and local — it must never make a
network call (ADR-115; `OPERATIONAL_ASSUMPTIONS.md` §9.3).

---

## 13. Worked example — a refund refused in production

Scenario: an LLM proposes a R$5,000 refund on a R$3,200 charge. The
kernel REFUSEs with `policy_violation:refund_above_charge_amount`. Who
owns what?

| Step | Who owns it |
|---|---|
| LLM emits the IntentEnvelope | Adopter (prompt design) |
| `adjudicate()` runs the Pack's guards | Framework (kernel) + Adopter (Pack pinning) |
| Decision is REFUSE | Framework (deterministic) |
| AuditRecord emitted with `auditHash` | Framework (algorithm) |
| Record reaches the audit pipeline | Adopter (self-hosted) / Hosted |
| Record persisted, queryable | Adopter / Hosted |
| Auditor reads the record next day | Hosted (RBAC, query service) — or Adopter |
| Auditor verifies `auditHash` (tamper check) | Framework (`verifyAuditRecord`) |
| Auditor traces back the LLM prompt context | Adopter (their prompt logs; not in scope of kernel audit) |
| Auditor concludes the refund was correctly refused | Adopter (compliance program) |

Note what's *not* on the framework: prompt design, prompt logging,
refund-policy thresholds, after-the-fact incident response. The
framework's job is "given this envelope and state, this is what was
decided, and you can prove it wasn't tampered with later." Everything
upstream and downstream is the adopter's or the hosted service's.

---

## 14. ADRs grounding this document

The matrix is grounded in concrete framework commitments documented as
ADRs under `docs/architecture/adr/`:

- **ADR-101** — kernel audit emission. The kernel always emits a
  record; the AuditSink is a separate concern.
- **ADR-102** — fail-closed default. If the AuditSink cannot persist,
  the kernel refuses.
- **ADR-103** — `RuntimeContext` per-tenant isolation. The seam the
  hosted offering relies on for per-tenant kill switches.
- **ADR-104** — envelope v2 + nonce. The taint-before-auth reorder the
  determinism story depends on.
- **ADR-105** — guard metadata + closed vocabulary. Bases are not
  arbitrary strings; that's what makes audit aggregation tractable.
- **ADR-111** — AuditRecord v4. The additive fields (`policyVersion`,
  `kernelVersion`, `auditHash`, `signature`) this document references.
- **ADR-114** — kill-switch v2.
- **ADR-115** — Pack-trust primitives (`verifyPackTrust`, fingerprint,
  signature policies).
- **ADR-124** — hallucination scoring; introduced the v5 `metadata`
  field (excluded from the `auditHash` pre-image).

The current `AUDIT_RECORD_VERSION` is **5**
(`packages/core/src/audit.ts`); the v4 fields above remain present and
v5 adds the optional `metadata` field. Where a matrix row spans two
columns, the seam between them is the contents of the relevant ADR.

---

## 15. What is deliberately not in this model

A few things the shared-responsibility model **does not address**, by
design:

- **LLM provider correctness.** The framework treats LLM output as
  UNTRUSTED by default; whether the provider hallucinates is
  irrelevant, because the kernel adjudicates the proposed intent
  regardless. The provider is not a party in this model.
- **The adopter's customer's behavior.** The kernel adjudicates
  proposed mutations; what an end user *intends* is between the adopter
  and the user. We do not opine on UX, consent, or experience patterns
  above the kernel.
- **Network reliability between adopter VPC and hosted gateway.** A
  standard cloud-network concern; the hosted service publishes SLOs for
  *the endpoint*, not for the customer's network path to it.

These omissions are intentional: a model that tries to cover every
failure mode collapses into mush. We cover the ones the framework's
design directly touches.

---

## 16. Versioning of this document

This document is versioned with the framework. When an ADR shifts a
responsibility, this matrix is updated in the same PR.

**Non-repudiation status (current).** The `signature` field exists in
the AuditRecord (v4+), is excluded from the `auditHash` pre-image, and
is persisted through `@adjudicate/audit-postgres` (`signature_jsonb`).
It is `null` unless an `AuditSigner` (a pluggable KMS/HSM hook) is
wired; no signer ships enabled in the OSS default. So tamper-evidence
(`auditHash`) is committed and live today; **authorship proof
(non-repudiation) is plumbed but off by default** — moving it from
"off" to a framework-or-hosted-shared row is a config/operational step,
not a schema change.

Adopters reviewing the hosted service for compliance should treat the
**version of this document at the time of their contract** as canonical
for the duration of that contract — we do not unilaterally shift
responsibility post-signing without a contract amendment.
