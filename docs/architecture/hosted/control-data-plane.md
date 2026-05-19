# Hosted — Control Plane / Data Plane Split

> **M4 architecture document.** Locks the design that the eventual
> `adjudicate.cloud` offering is built against. No code, no deployment,
> no Helm charts yet — this is the contract that downstream M-milestones
> implement.

---

## 1. Why the split exists

The kernel (`@adjudicate/core`) is deliberately stateless and pure: an
`adjudicate(envelope, state, bundle)` call has no I/O. That makes it
trivial to embed. It also means the hosted offering is *not* "run the
kernel for you" — adopters already do that in-process. What the hosted
offering owns is **everything around the kernel** that is hard to run
well: audit ingestion, durable storage, replay, kill-switch fanout,
billing, Pack distribution, tenant identity.

Those concerns fall into two failure domains. **Mixing them is the
classic SaaS mistake** that turns a transient identity-service blip into
a global ingestion outage. We separate them up front:

| Plane | Owns | Failure tolerance |
|---|---|---|
| **Control plane** | Auth, tenant registry, Pack registry, billing, kill-switch fanout, signing keys | Outage degrades *new* operations (signup, role change, key rotation). Existing data plane keeps ingesting. |
| **Data plane** | Audit ingestion, audit storage, query, console UI, replay, NATS/Kafka stream | Outage is **per-region**. Other regions keep working. Control plane keeps working. |

The invariant: **a control-plane outage MUST NOT lose audit data**, and a
data-plane outage in one region MUST NOT impair the others. Every design
decision below traces back to one of those two sentences.

---

## 2. Control-plane responsibilities

The control plane is a **single global region** — typically
`us-east-1` — with **read replicas** in every region the data plane runs
in. Writes always go to the home region; reads are local. We accept the
write-latency penalty (cross-region writes ~80–200ms) because control
operations are rare (account changes, key rotations, kill-switch flips)
relative to data operations (millions of audit records per hour).

### 2.1 Authentication & identity

- **API keys** are minted by the control plane and signed as JWTs. The
  JWT carries `tenant_id`, `roles` (see RBAC doc), `scopes`, `iat`,
  `exp`, and a `key_version` for rotation. The data plane verifies
  signatures locally using the control plane's public JWKS, cached
  with a 1-hour TTL. **The data plane never calls the control plane on
  the hot path of an ingestion request.**
- **Human users** authenticate via OIDC (Google / Microsoft / SAML for
  Enterprise) to the console. Console-issued session tokens are
  short-lived JWTs (15 min) refreshed against the control plane.
- **Service accounts** for CI / orchestrators receive opaque tokens that
  resolve to a signed JWT on first use (a "claim" exchange), so the
  opaque token can be revoked without rotating all data-plane caches.

The JWT-vs-opaque trade-off is detailed in the RBAC doc; the short
answer is: signed JWTs for ingestion (latency-sensitive, no online
revocation needed because lifetime is short), opaque tokens for console
sessions (revocation matters, latency does not).

### 2.2 Tenant registry

Every tenant has one row keyed by `tenant_id` (ULID). The row stores:
- billing plan (Free / Starter / Pro / Enterprise)
- isolation tier (row / schema / dedicated — see RBAC doc §3)
- home data-plane region (initially write-once; migrations are a manual
  operation post-v1.0)
- per-tenant feature flags (e.g. `cmek_enabled`, `pack_signing_required`)
- kill-switch state (replicated to all data-plane regions via NATS)

The registry is the **source of truth**; the data plane caches it. A
tenant deletion is a soft-delete (`deleted_at`) plus a cascading purge
job that the data plane executes asynchronously, gated by the retention
SLA the customer signed.

### 2.3 Pack registry

Packs (e.g. `@adjudicate/pack-payments-pix`, future `pack-refunds`,
`pack-hr-approvals`) are versioned, signed artifacts published to the
control plane. The registry stores:
- package name + semver + immutable content hash
- signature (signed by Anthropic for first-party Packs; signed by the
  adopter's KMS key for private Packs)
- compatibility metadata (`kernelVersion` range, `policyVersion` per the
  AuditRecord v4 fields from ADR-111)
- changelog + risk notes (markdown, surfaced in the console)

The data plane mirrors signed Packs to a region-local OCI registry on a
pull-through cache. Tenants pin Packs to a specific version per ADR-111;
the data plane refuses to start an executor on an unpinned Pack in
production isolation tiers.

### 2.4 Billing

Billing aggregates per-tenant per-region usage counters into a single
global meter. Each data-plane region emits hourly usage summaries
(records ingested, records stored × days, bytes egressed, console
seats) to a Kafka topic the control plane consumes. The meter is
**append-only**; corrections are credit entries, never overwrites.
Stripe is the billing-of-record; the control plane's job is to compute
the line items, not store payment data.

The pricing axis is `audit_volume × retention` — see the deployment
topology doc §5 for the full table.

### 2.5 Kill-switch fanout

This is the most safety-critical control-plane responsibility. Per
ADR-103, every tenant has a `RuntimeContext` with an independent kill
switch. The hosted control plane is the **single source of truth** for
"is tenant X killed?" A kill-switch flip propagates as:

1. Operator (or automation) toggles the switch via the control-plane
   API. The control plane writes to its registry and publishes
   `tenant.kill_switch.flipped` on a NATS JetStream subject.
2. Each data-plane region subscribes to that subject and updates its
   local cache. The cache backs `RuntimeContext.killSwitch.isKilled()`
   for every adopter executor running in that region (in the
   self-hosted-with-managed-control-plane topology — see §6 below).
3. **Acknowledgement is per-region, not per-executor.** Once a region
   reports "applied", the control plane considers the kill propagated.
   Individual executors poll the region cache; cache TTL is 5 seconds
   in production tiers, 60 seconds in Free.

The fanout latency SLO is **p99 < 30 seconds, global**. This is the
number that matters for incident response.

---

## 3. Data-plane responsibilities

The data plane is **per-region**. A region is a single cloud region in
a single cloud provider (we start AWS-only; GCP follows Pro-tier launch).
Each region runs the full data stack independently. Cross-region
replication is opt-in, configured per-tenant.

### 3.1 Multi-tenant ingestion gateway

The ingestion gateway is the only data-plane component the customer's
infrastructure talks to. It is a stateless Go service (no JVM cold-start
penalty, no Node.js event-loop tuning) that accepts gRPC over mTLS.

Request shape:

```
   IngestionGateway.IngestRecord(stream AuditRecord) returns IngestAck
```

Streaming gRPC is the load-bearing choice — adopters batch records on
the client side, and a single open stream amortizes the mTLS handshake
across thousands of records. **The wire format is AuditRecord v4 from
ADR-111** with the `auditHash` field required for hosted ingestion
(unlike OSS where it is optional). Records arriving without `auditHash`
are rejected with a `400 missing_audit_hash` basis code.

The gateway performs four steps per record, in order:

1. **mTLS client cert validation.** Each tenant issues its own client
   cert from the control plane; cert pinning prevents key reuse across
   tenants.
2. **API-key JWT signature check** against the cached JWKS. Failure →
   401, no record stored, metric incremented.
3. **Schema validation** against the AuditRecord v4 Zod schema from
   `@adjudicate/admin-sdk`. The schema check is `.strict()` — unknown
   fields are rejected, never silently dropped. Failure → 400 with the
   first Zod issue path returned to the caller.
4. **Tenant-scope enforcement** — the `tenantId` field on the record
   MUST equal the `tenant_id` claim on the JWT. Mismatch is a
   **security event**: the record is rejected with 403, the event is
   logged to the security SIEM topic, and the tenant's API key is
   flagged for review. This is the single guard that prevents tenant A
   from writing tenant B's audit log.

### 3.2 Rate limiting

Per-tenant token-bucket limits, enforced at the gateway. Limits are
sourced from the control-plane tenant registry and cached for 60s.
The bucket is implemented in Redis with the same Lua-script atomic
INCR pattern adopters use OSS (no race between INCR and EXPIRE). A
429 response carries `X-RateLimit-Reset` and the `basis.code`
`rate_limit_exceeded` so the adopter's outbox can retry intelligently.

The Free tier rate-limits aggressively (100 records/sec burst, 10 RPS
sustained); Enterprise has soft limits with a quota notification at
80% and a hard limit at 110% with explicit override.

### 3.3 Audit storage

Per ADR-111, AuditRecord v4 has four storage-relevant indexes:
`recorded_at`, `tenantId`, `intentHash`, `policy_version`, plus
`audit_hash` for lookups. The data plane stores records in:

- **Postgres** — hot store, 0–13 months depending on plan. Partitioned
  by `(tenantId, recorded_at)` for query locality. Pro and Enterprise
  use schema-per-tenant or dedicated-database isolation (see RBAC doc).
- **S3 (Glacier Deep Archive on Enterprise)** — cold store, beyond
  retention. Records are sealed in 1-hour chunks per tenant, hashed,
  and the hash is anchored in the tenant's cold-store manifest. The
  manifest itself is signed by the data plane's KMS key.

Replication is **per-region**. Cross-region replication is opt-in
(Enterprise tier), implemented via Kafka MirrorMaker 2 on the audit
topic. We do **not** use Postgres logical replication across regions —
the storage shape diverges (partitioning, schema layout) and a
replay-from-Kafka rebuild is the supported DR primitive.

### 3.4 Per-tenant Kafka topic

Every tenant gets a Kafka topic named `audit.tenant-${tenant_id}`. This
is *not* an optimization — it is a **security boundary**:

- Per-tenant topic ACLs in Kafka mean a misconfigured consumer can
  read at most one tenant's records.
- Per-tenant retention policies on the topic let Free tenants have a
  24-hour Kafka buffer while Enterprise tenants have 7 days
  (matching their SLA for "we lost a database; replay from Kafka").
- Backpressure is per-tenant: a tenant that bursts to 100x normal
  volume cannot starve other tenants of broker capacity (Kafka quota
  per topic).

The cost of this design is operational: 1000 tenants → 1000 topics.
Modern Kafka (4.x with KRaft) handles 100k topics comfortably; we
have headroom for ~5 years of growth before partitioning the cluster.

### 3.5 Query layer

The console reads through a **read-only query service** that wraps
Postgres + the cold store. The query service:
- enforces RBAC at the row level (Viewer cannot see records outside
  their tenant scope, see RBAC doc §1)
- joins live records (Postgres) with archived records (S3) when a
  query spans the boundary
- caches aggregate panels (records/day, refusal-rate-by-basis) for
  60s in Redis

The console UI is a Next.js app deployed per-region behind the same
gateway as the ingestion endpoint. Console session JWTs carry the
region; cross-region console access goes through control-plane
re-auth.

### 3.6 NATS / Kafka stream taps

Adopters can subscribe to their **own** tenant's audit stream — e.g.
to drive a SIEM, a Slack alert on every ESCALATE, or a sample-based
manual review queue. The data plane exposes this via:
- **NATS JetStream** — low-latency, pull-based, push-based, or queue
  group, with per-subject filters (`audit.tenant-${id}.kind.>`).
- **Kafka direct** — for adopters who already operate Kafka
  infrastructure and want their tenant's topic mirrored to their VPC
  via MirrorMaker.

Both are optional; the audit log is durable in Postgres either way.

---

## 4. Deployment diagram

```
                          ┌───────────────────────────────────┐
                          │  Customer VPC (the adopter's app) │
                          │                                   │
                          │   executor with @adjudicate/core  │
                          │   ↓ emits AuditRecord v4          │
                          │   AuditSink (HTTP/gRPC client)    │
                          └────────────────┬──────────────────┘
                                           │ mTLS + JWT
                                           ▼
            ╔══════════════════════════════════════════════════════╗
            ║         Data Plane — region us-east-1 (example)      ║
            ║                                                      ║
            ║   ┌─────────────┐    ┌──────────────┐                ║
            ║   │ Ingestion   │───▶│  Kafka topic │                ║
            ║   │ Gateway     │    │ audit.tenant-X                ║
            ║   │ (Go, gRPC)  │    └──────┬───────┘                ║
            ║   └─────────────┘           │                        ║
            ║                             ▼                        ║
            ║                    ┌──────────────────┐              ║
            ║                    │  Audit consumer  │              ║
            ║                    │ (writes Postgres)│              ║
            ║                    └────────┬─────────┘              ║
            ║                             ▼                        ║
            ║                    ┌──────────────────┐  ─sealed─▶  S3 / Glacier
            ║                    │  Postgres (RLS)  │             (cold archive)
            ║                    └────────┬─────────┘              ║
            ║                             ▼                        ║
            ║                    ┌──────────────────┐              ║
            ║                    │  Query Service   │◀── Console UI
            ║                    │   + RBAC enforce │                
            ║                    └──────────────────┘              ║
            ╚══════════════════════════════════════════════════════╝
                                           ▲
                                           │ JWKS, registry, kill-switch
                                           │ (read-only, cached)
                          ┌────────────────┴──────────────────┐
                          │     Control Plane (global)        │
                          │                                   │
                          │  ┌───────────┐  ┌─────────────┐   │
                          │  │   Auth    │  │   Tenant    │   │
                          │  │  / OIDC   │  │  Registry   │   │
                          │  └───────────┘  └─────────────┘   │
                          │  ┌───────────┐  ┌─────────────┐   │
                          │  │   Pack    │  │   Billing   │   │
                          │  │ Registry  │  │   Meter     │   │
                          │  └───────────┘  └─────────────┘   │
                          │  ┌────────────────────────────┐   │
                          │  │  Kill-switch fanout (NATS) │   │
                          │  └────────────────────────────┘   │
                          └───────────────────────────────────┘
                                           ▲
                                           │ read replicas
                                           │ in eu-west-1, ap-southeast-2
                                           ▼
                                    Other data-plane regions
```

The single arrow that matters most: **customer VPC → ingestion gateway
via mTLS**. Everything else is internal plumbing. The adopter's only
contact with the hosted offering on the hot path is that one gRPC call.

---

## 5. Why control = global, data = per-region

The naive design is symmetric: control and data both per-region, with
cross-region replication everywhere. We reject that for three reasons:

1. **Identity coherence.** A user who creates a tenant in `us-east-1`
   and then opens the console from EU expects to see the same tenant,
   not a partition. Multi-region active-active for an identity system
   is a five-year project and not core to the value proposition.
2. **Kill-switch latency floor.** A multi-region active-active control
   plane has minimum replication latency in the hundreds of
   milliseconds for any write that must be globally visible. The
   kill-switch fanout SLO (p99 < 30s) is dominated by NATS propagation;
   we don't need a sub-second control plane to meet that.
3. **Failure-domain reasoning.** A global control plane has one
   failure mode operators have to reason about. Per-region control
   planes multiply that by N regions and add the cross-region
   reconciliation logic.

Data, conversely, **must** be per-region:
- Data residency (EU customers cannot have audit logs leaving the EU).
- Latency: audit ingestion on the hot path of every kernel decision
  cannot afford cross-Atlantic round trips.
- Blast radius: a Postgres outage in `us-east-1` cannot impair EU
  customers.

The control plane is small (~10 services, ~50 GB of data steady-state).
A short outage (single-digit minutes) of the control plane is tolerable
because **no data plane depends on the control plane being available
during normal operation** — caches absorb the gap. New signups, role
changes, and Pack publishes fail closed during a control-plane outage,
which is the correct trade.

---

## 6. Three customer-deployment topologies

The same control / data plane split supports three customer
relationships, configured per-tenant:

| Topology | Where the data plane runs | Where the control plane runs |
|---|---|---|
| **Fully hosted** (Free, Starter, Pro) | Anthropic-managed region | Anthropic-managed global |
| **BYO-cloud** (Enterprise) | Customer-owned VPC, Anthropic-managed software | Anthropic-managed global |
| **Self-hosted with managed control plane** (regulated Enterprise) | Customer-operated | Anthropic-managed global (kill switches + Pack registry only) |

In all three, the **wire protocol is the same** (gRPC + mTLS + JWT), the
**AuditRecord schema is the same** (v4 per ADR-111), and the
**control-plane API surface is the same**. What varies is who owns the
operational responsibility for the data plane — see the shared-
responsibility doc for the per-concern split.

---

## 7. Open questions deferred to post-v1.0

- **Multi-cloud data plane.** GCP support is targeted for v1.1. Azure
  is on the long list, not committed.
- **Active-active data plane within a region.** Currently a region is
  one AZ-resilient cluster; an active-active multi-AZ design with
  conflict-free record IDs is being scoped.
- **In-region read replicas of the control plane.** The first version
  reads from a single global writer; if latency complaints land,
  region-local read replicas of the auth + registry tables are the
  obvious next move. The data-plane caches already insulate against
  the latency, so this is "polish" rather than "required".

These are tracked separately; this doc locks the v1.0 design.
