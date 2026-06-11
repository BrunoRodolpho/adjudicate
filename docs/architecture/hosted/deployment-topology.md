# Hosted — Deployment Topology

> **M4 architecture document.** Three topologies, one pricing axis. The
> kernel itself remains OSS and free forever — the hosted offering
> sells **the operational pain you would otherwise own.**

---

## 1. The three topologies

There are exactly three supported deployment shapes. Adopters choose
based on **decision throughput × isolation requirements**, not by team
size or feature checklist. The shapes are intentionally
discontinuous: there is no "tier 1.5". A clean step function makes
operational reasoning tractable.

| Topology | Target adopter | Decision throughput | Audit retention | Operational owner |
|---|---|---|---|---|
| **Single-node** | Dev, prototyping, internal tools | ≤ 100 dec/sec | ≤ 30 days | The adopter |
| **Three-tier** | Production app, single-region | ≤ 10,000 dec/sec | ≤ 13 months hot | The adopter (or hosted Pro) |
| **Multi-region** | Multi-tenant SaaS, regulated workloads | 10k+ dec/sec, sharded | 7 years cold | Hosted only |

The kernel runs in every topology with **the same code path**. What
changes is the storage, the messaging fabric, and the kill-switch
distribution model. The kernel's purity (no I/O on the hot path) is
what makes this scale-out feasible without rewriting any policy code.

---

## 2. Single-node (dev / small prod)

The simplest topology that exercises the full kernel + Pack + audit
pipeline. Suitable for development, integration tests, internal tools,
and small production deployments where one host failure is recoverable
by a deploy.

```
   ┌────────────────────────────────────────────────────────────┐
   │  Single host (4 vCPU / 16 GB RAM is plenty)                │
   │                                                            │
   │    ┌──────────────────────────────────────────────┐        │
   │    │  Node.js executor (Express / Fastify / etc.) │        │
   │    │                                              │        │
   │    │   @adjudicate/core kernel  ──┐               │        │
   │    │   @adjudicate/pack-*  ────┐  │               │        │
   │    │   AuditSink ─────────────┐│  │               │        │
   │    └────────────────────────┐ ││  │               │        │
   │                             │ ▼▼  ▼               │        │
   │    ┌────────────────────┐   │ ┌──────────┐        │        │
   │    │  Redis (single)    │◀──┘ │ Postgres │        │        │
   │    │  - ledger          │     │ - audit  │        │        │
   │    │  - rate limit      │     │ - state  │        │        │
   │    │  - kill-switch     │     │   stores │        │        │
   │    └────────────────────┘     └──────────┘        │        │
   │                                                            │
   └────────────────────────────────────────────────────────────┘
```

**What's deployed:**
- One Node.js process (the adopter's executor) hosting the kernel
  in-process. The kernel is a TypeScript library; there is no separate
  "kernel service".
- One Redis (a single instance, no replica). Holds the execution
  ledger (replay-dedup window), rate-limiter token buckets, and the
  process-local kill-switch cache.
- One Postgres (a single instance, daily backups). Holds the
  `@adjudicate/audit-postgres` sink tables (AuditRecord rows; ADR-111
  introduced v4, the current shape is v5 per ADR-124) and whatever
  domain state the executor needs.

**What's not deployed:**
- No NATS, no Kafka. Audit writes are synchronous to Postgres on this
  topology (the executor's HTTP handler waits for the audit-write to
  succeed before responding). This is acceptable up to ~100 dec/sec
  on modest hardware; beyond that, write-amplification on the same
  Postgres becomes the bottleneck.
- No replication, no failover. A host failure means downtime. Daily
  backups bound the data-loss window.

**Operational properties:**
- **Throughput ceiling:** ~100 dec/sec sustained, ~500 dec/sec burst.
  The bottleneck is the synchronous audit write.
- **Kill switch:** local-only (the `RuntimeContext.killSwitch` set via
  env var or an admin endpoint). No fanout.
- **Cost:** dominated by Postgres storage. At 10k records/day and 30-day
  retention, ~300k records, ~600 MB — fits on the smallest managed
  Postgres tier.

This topology maps to the **Free** hosted plan when run by us, and is
the default for adopters who self-host with a small footprint.

---

## 3. Three-tier (production, single-region)

The first topology that separates the kernel's failure domain from the
audit's failure domain. Suitable for production workloads where audit
durability is a contractual requirement and the executor must keep
serving even if the audit pipeline degrades.

```
   ┌────────────────────────────────────────────────────────────────┐
   │  Region us-east-1 (single region, single AZ-resilient cluster) │
   │                                                                │
   │   ┌──────────────────────────────────────────────────┐         │
   │   │  Load balancer (ALB / GCLB / nginx)              │         │
   │   └────────────────────┬─────────────────────────────┘         │
   │                        │                                       │
   │                        ▼                                       │
   │   ┌──────────────────────────────────────────────────┐         │
   │   │   Executor cluster (N nodes, autoscaling group)  │         │
   │   │   @adjudicate/core kernel in every node          │         │
   │   └─┬──────────────────┬──────────────────────┬──────┘         │
   │     │                  │                      │                │
   │     ▼                  ▼                      ▼                │
   │   ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐    │
   │   │ Redis        │  │ NATS / Kafka   │  │ Postgres        │    │
   │   │  (cluster, 3 │  │  (broker pool, │  │  (partitioned   │    │
   │   │  shards, RW  │  │  3 brokers)    │  │  by tenant +    │    │
   │   │  replicas)   │  │                │  │  recorded_at,   │    │
   │   │              │  │   audit topic  │  │  PITR enabled)  │    │
   │   └──────────────┘  └────────┬───────┘  └─────────▲───────┘    │
   │                              │                    │            │
   │                              ▼                    │            │
   │                     ┌────────────────┐            │            │
   │                     │ Audit consumer │────────────┘            │
   │                     │ (writes Pg)    │ (async, batched)        │
   │                     └────────────────┘                         │
   │                                                                │
   └────────────────────────────────────────────────────────────────┘
```

**What's deployed (over single-node):**
- Executor nodes are **horizontally scaled** behind a load balancer.
  The kernel is stateless; the only inter-node coordination is via
  Redis (ledger dedup) and the broker (audit pub).
- Redis is a **3-shard cluster** with replicas. The cluster gives
  ledger writes throughput headroom and replicas give recoverability
  on shard-master failure.
- A **broker** (NATS JetStream for adopters who already run NATS,
  Kafka for those who don't) decouples audit emission from audit
  storage. The executor's hot path `publish(record)` is a few
  milliseconds; the consumer batches and writes Postgres in the
  background.
- **Postgres is partitioned** by `(tenant_id, recorded_at)`. PITR
  (point-in-time recovery) is enabled with 7–35 day windows depending
  on plan. Read replicas serve dashboard queries.

**Operational properties:**
- **Throughput ceiling:** ~10,000 dec/sec sustained per region. Beyond
  that, broker partitioning starts to be the operational concern, and
  we recommend multi-region.
- **Audit-pipeline backpressure:** if the audit consumer falls behind,
  the broker buffers (NATS JetStream: stream limit; Kafka: retention
  window). The executor keeps serving — its `publish()` does not block
  on the consumer. **The trade-off is explicit:** if the broker fills
  up, `publish()` starts to fail, and the AuditSink's fail-closed
  default (ADR-102) triggers the kernel to REFUSE. This is the right
  behavior — we never silently lose audit records — but operators
  must size the broker to absorb expected backpressure windows
  (typically: 4 hours at peak rate).
- **Kill switch:** distributed via Redis pub/sub (or NATS, or Kafka,
  depending on broker choice). The fanout is in-region only; for
  multi-region, see §4.
- **Cost:** dominated by Postgres storage at scale. At 100k dec/sec
  averaged over a day, ~8.6B records/day, ~1.7 TB/day at
  ~200 bytes/record. Retention budget is the hot-store sizing input.

This topology maps to the **Starter** and **Pro** hosted plans, and is
the default for self-hosted production deployments. The hosted
offering's data plane *is* this topology, replicated per region (§4
below).

---

## 4. Multi-region (multi-tenant SaaS)

The topology that the hosted offering runs at scale. Each region is a
full three-tier deployment from §3; cross-region wiring is what makes
it a single product instead of a federation of independent regions.

```
   Customer VPC (any region)                Customer VPC (any region)
        │                                          │
        │ mTLS + JWT                               │ mTLS + JWT
        ▼                                          ▼
   ╔══════════════════════════╗            ╔══════════════════════════╗
   ║ Data Plane — us-east-1   ║            ║ Data Plane — eu-west-1   ║
   ║  (three-tier from §3)    ║            ║  (three-tier from §3)    ║
   ║                          ║            ║                          ║
   ║  Postgres (live)         ║            ║  Postgres (live)         ║
   ║  Kafka audit topic ──────╬───────┐    ║                          ║
   ║                          ║       │    ║                          ║
   ╚══════════════════════════╝       │    ╚══════════════════════════╝
                                      │
                              MirrorMaker 2
                            (opt-in per tenant,
                             Enterprise-only)
                                      │
                                      ▼
                          ╔════════════════════════╗
                          ║  DR replica region     ║
                          ║   - Kafka mirror only  ║
                          ║   - Postgres rebuilt   ║
                          ║     from Kafka on need ║
                          ╚════════════════════════╝

   ┌──────────────────────────────────────────────────────────────┐
   │ Control Plane — global (us-east-1 writer, read replicas)     │
   │                                                              │
   │   Auth · Tenant registry · Pack registry · Billing meter     │
   │                                                              │
   │   NATS JetStream:  control.tenant.${id}.killswitch.flipped   │
   │                                                              │
   └──┬───────────────────────┬───────────────────────┬───────────┘
      │                       │                       │
      ▼ (cached in            ▼                       ▼
       region-local           region us-east-1        region eu-west-1
       region kill-switch caches → executors poll)
```

**What's deployed (over three-tier):**
- **Multiple regions, each a full three-tier.** No shared state across
  regions on the hot path. Each region has its own Postgres, its own
  Kafka cluster, its own Redis cluster.
- **Global control plane** (from the control-data-plane doc §2). The
  control plane is a single writer with read replicas in every data-
  plane region. Data-plane components cache control-plane reads
  aggressively; they do not depend on the control plane during normal
  operation.
- **Cross-region audit replication** for Enterprise tenants who opt in.
  Implemented as Kafka MirrorMaker 2 from the primary region's audit
  topic to a DR region's audit topic. **Postgres is rebuilt from
  Kafka** in a DR scenario, not replicated continuously — the storage
  shape per region (partitioning, indexes) is allowed to drift, and
  replay-from-log is the cheaper invariant to preserve.
- **Global kill-switch fanout** via the control-plane NATS subject.
  Per-region caches; per-tenant `RuntimeContext` (ADR-103); SLO p99
  < 30 seconds globally.

**Operational properties:**
- **Throughput ceiling:** linear in regions × per-region capacity. The
  ceiling per region (10k dec/sec) is the engineering tradeoff; the
  hosted offering treats it as the unit of scale.
- **Failure-domain story:**
  - A region outage takes down that region's customers (their
    executor still runs; their hosted audit pipeline is unavailable
    in-region). Adopters with cross-region replication see their
    audit log continue in the replica region's read-only mirror.
  - A control-plane outage stops *new* control operations (signups,
    role changes, Pack publishes, kill-switch flips). Existing data
    planes keep ingesting against cached identity material.
  - A broker outage in one region triggers AuditSink fail-closed in
    that region's executors. Other regions are unaffected.
- **Kill switch:** global propagation. An Operator in any region can
  flip a tenant's kill switch; it is observed in all regions within
  the SLO window.
- **Cost:** dominated by **cross-region transfer** for the small set
  of tenants who opt into replication, and by **cold storage** for
  long-retention tenants (7 years on Enterprise → S3 Glacier Deep
  Archive at ~$1/TB/month).

This topology is **hosted-only** in v1.0. The OSS framework supports
multi-region by configuration (run a three-tier per region, glue them
with your own Kafka MirrorMaker setup), but we do not commit to that
being a turnkey experience without the hosted control plane.

---

## 5. Pricing axis: audit volume × retention

The hosted offering's pricing is the simplest two-variable function we
could devise. **The kernel is OSS forever** — there is no charge for
adjudication itself; there is no charge for the Packs we publish under
open-source licenses. What we sell is **persistence of records over
time, with operational guarantees attached.**

The two variables:

- **Audit volume** — records ingested per month. A record is an
  AuditRecord (current shape v5; ADR-111 introduced v4, ADR-124 added
  `metadata` in v5) of any decision kind.
- **Retention** — how long that record is queryable from the console
  and via the query API. Beyond retention, records are sealed to cold
  storage (Enterprise) or deleted (Free/Starter/Pro at their
  retention boundary).

The plans:

| Plan | Monthly price | Audit volume | Retention | Isolation | SLA | Notes |
|---|---|---|---|---|---|---|
| **Free** | $0 | 100k records | 7 days | Row-level (RLS) | Best-effort | No PII / regulated workloads in terms of service |
| **Starter** | $99 | 1M records | 90 days | Schema-per-tenant | 99.5% | One region, one project |
| **Pro** | $499 | 10M records | 13 months | Schema-per-tenant | 99.9% | Multi-region read replicas |
| **Enterprise** | from $5,000 | 100M+ records (custom) | Up to 7 years cold (S3 Glacier) | Database-per-tenant or dedicated | 99.99% | CMEK, BYO-cloud, SCIM, custom DPA |

**Overage:** Free has a hard ceiling (excess records are rejected at
the ingestion gateway with `400 quota_exhausted`). Starter and Pro
have soft ceilings — excess records are accepted, billed at the
per-record overage rate, and a notification is sent at 80% of the
included quota and at 100%. Enterprise quotas are committed-use; over-
consumption is a billing reconciliation, not a runtime block.

**Why volume × retention and not "seats" or "decisions/sec":**
- **Seats** scales poorly with the value proposition. An adopter with
  one engineer and a thousand transactions per second has the same
  storage cost as an adopter with twenty engineers and the same
  throughput.
- **Decisions per second** is the kernel's metric, and the kernel is
  free. Charging for decisions/sec amounts to charging for kernel
  invocations, which we deliberately do not.
- **Volume × retention** is exactly the cost we incur (storage,
  durability, replication). It also aligns the customer's incentive
  to **emit fewer, higher-signal records** — sampling READ_ONLY
  decisions, aggregating high-frequency low-signal kinds, etc. The
  pricing model gently pushes adopters toward better audit hygiene.

**What is and is not metered:**

| Metered | Not metered |
|---|---|
| Records ingested via the ingestion gateway | Kernel invocations |
| Stored bytes × retention days | Pack downloads (registry traffic) |
| Cold-store reads (Glacier retrieval, Enterprise only) | Dashboard panel views |
| Egress for stream-tap subscribers | Console user seats (within plan limits) |
| Cross-region replication transfer (Enterprise) | Documentation, support requests within plan SLA |

**Floor pricing:** Enterprise contracts have a $5,000/month floor even
when usage is below that, reflecting the fixed cost of dedicated
isolation. Below $5,000/month of usage, Pro is the right tier.

---

## 6. Migration paths between topologies

Adopters move between topologies as their needs grow. The supported
paths:

- **Single-node → three-tier** (self-hosted, in-place):
  - Add NATS or Kafka, point AuditSink at the broker, deploy the
    audit consumer.
  - Migrate the single Postgres to a partitioned table layout (one
    downtime window; alternatively a dual-write window).
  - Add Redis cluster (the connection string changes; no schema
    change).
- **Self-hosted three-tier → hosted three-tier** (Starter/Pro):
  - Point the AuditSink at the hosted ingestion gateway endpoint
    instead of the in-VPC broker. The wire format (the AuditRecord
    contract, additive across versions) is identical. The kernel code
    does not change.
  - Existing audit records stay in the self-hosted Postgres; the
    hosted offering only stores records emitted after the cutover.
    Historical records remain queryable in the adopter's own
    Postgres for as long as they retain it.
- **Hosted three-tier (Pro) → multi-region (Enterprise)**:
  - Hosted-managed migration. Tenant home region is set; cross-region
    replication is enabled per-tenant; CMEK keys (if applicable) are
    provisioned.
  - Customer-facing API surface is unchanged.

**Downgrade paths** are *not* supported as one-click operations:
- Enterprise → Pro is a manual decommission of dedicated resources
  and migration to shared isolation. The customer's audit records
  stay accessible throughout, but the migration is a scheduled
  operation requiring an Owner approval and a CSM-supported window.
- Pro → Starter is supported as a billing change; the underlying
  storage moves on the next provisioning cycle.

The asymmetry (upgrades easy, downgrades supervised) reflects the
asymmetric risk: upgrading isolation never reduces a customer's
security posture; downgrading it does.

---

## 7. Why "OSS kernel + hosted operations" is the only durable shape

A recurring question: why not sell the kernel?

Because the kernel is **a small body of pure code** and its value
comes from being deterministic, embeddable, and trustworthy. A
"hosted kernel" that runs `adjudicate()` over the network adds the
latency, the failure mode, and the opacity that the kernel was
designed to eliminate. Adopters embed the kernel; nobody calls it
over the wire.

What is operationally hard is **everything around the kernel** at
scale: durable audit, multi-region replication, kill-switch
distribution, role-based access to the audit, signed Pack
distribution, compliance attestations. We sell that. The kernel's
purity is the foundation that makes the hosted offering trustworthy:
**we cannot break the adopter's runtime by changing our hosted
software**, because the adopter's runtime contains zero hosted code.

That's the durable shape. Kernel OSS, hosted ops paid — neither side
of the split has a perverse incentive to compromise the other.
