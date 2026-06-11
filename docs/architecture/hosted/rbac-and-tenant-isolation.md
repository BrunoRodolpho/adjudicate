# Hosted — RBAC and Tenant Isolation

> **M4 architecture document (DESIGN, not built).** Locks the
> access-control surface the eventual `adjudicate.cloud` offering will be
> built against. No control-plane, RBAC, JWT, Kafka-ACL, or
> tenant-provisioning code exists in this repo yet — this is the contract
> that downstream M-milestones implement, not a description of current
> behavior.
>
> **What exists in code today** (`@adjudicate/core` v1.3.0): the
> per-process and per-tenant **kill switch** via `RuntimeContext`
> (ADR-103) and kernel **audit emission** (ADR-101). Everything below
> about roles, isolation tiers, Kafka topics, Redis prefixing, and the
> JWT shape is a planned surface. Where a section overlaps with shipped
> kernel behavior, the actual code contract is called out inline.

---

## 1. Five RBAC roles

There are exactly five roles. Adding a sixth requires an ADR; deleting
one is a breaking change. The set was chosen to map cleanly onto how
real organizations divide work around an audit system:

| Role | Mental model | Read scope | Mutate scope | Billing/admin |
|---|---|---|---|---|
| **Viewer** | "Compliance analyst reading the log" | Audit records, dashboards | Nothing | None |
| **Auditor** | "External or internal auditor" | Audit records + replay + verifyAuditRecord results, **across all tenant projects within their tenant** | Annotate records (read-only otherwise) | None |
| **Operator** | "Site Reliability Engineer on rotation" | Everything Viewer + Auditor see | Kill switch, DLQ drain, replay-historical commands | None |
| **Admin** | "Platform owner" | Everything | Everything Operator does, plus user/role management, Pack version pinning, API-key minting | View billing |
| **Owner** | "Account creator / billing-of-record" | Everything | Everything Admin does, plus delete tenant, change plan, transfer ownership, manage CMEK keys (Enterprise) | Full billing |

The roles are **strictly hierarchical** — every Admin capability is a
superset of every Operator capability, and so on. This is a constraint,
not a discovery: a non-hierarchical role lattice produces audit cases
where "Operator A could not have done X, but Auditor B could have"
which is the opposite of the property we want from an audit system.

### 1.1 Capability table (canonical)

The capability strings are the **wire format** for permission checks.
They appear as strings in the JWT `scopes` claim and in the audit log
when an Operator/Admin/Owner action is recorded.

| Capability | Viewer | Auditor | Operator | Admin | Owner |
|---|:---:|:---:|:---:|:---:|:---:|
| `audit:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `audit:replay` |  | ✓ | ✓ | ✓ | ✓ |
| `audit:verify` |  | ✓ | ✓ | ✓ | ✓ |
| `audit:annotate` |  | ✓ | ✓ | ✓ | ✓ |
| `dashboard:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pack:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pack:pin` |  |  |  | ✓ | ✓ |
| `pack:publish_private` |  |  |  | ✓ | ✓ |
| `killswitch:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `killswitch:flip` |  |  | ✓ | ✓ | ✓ |
| `dlq:read` |  | ✓ | ✓ | ✓ | ✓ |
| `dlq:drain` |  |  | ✓ | ✓ | ✓ |
| `replay:historical` |  |  | ✓ | ✓ | ✓ |
| `apikey:list` |  |  |  | ✓ | ✓ |
| `apikey:mint` |  |  |  | ✓ | ✓ |
| `apikey:revoke` |  |  | ✓ | ✓ | ✓ |
| `user:invite` |  |  |  | ✓ | ✓ |
| `user:role:change` |  |  |  | ✓ | ✓ |
| `billing:read` |  |  |  | ✓ | ✓ |
| `billing:write` |  |  |  |  | ✓ |
| `tenant:delete` |  |  |  |  | ✓ |
| `tenant:transfer` |  |  |  |  | ✓ |
| `cmek:manage` |  |  |  |  | ✓ |

Two non-obvious calls in this table:

- **`apikey:revoke` is granted to Operator** but `apikey:mint` is not.
  Rationale: rotating a compromised key during an incident is an
  Operator concern; creating new keys is a governance concern. This is
  the cleanest split that matches incident-response runbooks.
- **`audit:annotate` is granted to Viewer**. The annotation system
  stores Viewer comments on records but never mutates the records
  themselves (annotations are a separate table joined by `record_id`),
  so this does not violate audit immutability. Annotations carry the
  annotator's user ID and timestamp; they are themselves audit-logged.

### 1.2 Why no per-resource ACLs in v1.0

We considered (and deferred to post-v1.0) per-resource ACLs of the
"User X has Viewer role except cannot read records where
`envelope.kind = pix.charge.refund`" shape. They are a real customer
need for compliance partitioning (e.g. "auditors for the payments
business unit cannot read HR records"). v1.0 ships **role-per-tenant**
only; the v1.x design will add **scoped roles** (`Viewer for project
acme-payments`) before fine-grained ACLs. Premature ACL design is the
single biggest source of incoherent permission models in SaaS
products; we will earn the right to ship them.

---

## 2. Three tenant-isolation tiers

The hosted offering supports three isolation tiers. The tier is a
**plan-level** property — Free is row-level, Pro is schema-level,
Enterprise is database-level. The tier MUST be a one-way upgrade:
moving from Pro → Enterprise is a tenant-migration job, moving from
Enterprise → Pro is not supported (you do not downgrade isolation).

| Tier | Plan | Physical layout | Postgres feature | Tradeoff |
|---|---|---|---|---|
| **Row-level** | Free | One shared cluster, one shared schema, `tenant_id` column on every table | Postgres Row-Level Security (RLS) policies | Cheapest. Single bug in an RLS policy is the blast radius. |
| **Schema-per-tenant** | Starter, Pro | One shared cluster, one schema per tenant | `SET search_path` plus per-schema GRANTs | Strong isolation, modest operational overhead (schema count). |
| **Database-per-tenant** or **dedicated cluster** | Enterprise | Either one DB per tenant on a shared cluster, or a fully dedicated cluster | Postgres `pg_hba.conf` per role; dedicated cluster has no shared blast radius | Strongest isolation. Operationally expensive — typically what Enterprise pricing covers. |

### 2.1 Row-level (Free)

Every audit table has a `tenant_id UUID NOT NULL` column. RLS policies
restrict every `SELECT` / `INSERT` / `UPDATE` / `DELETE` to rows where
`tenant_id = current_setting('app.tenant_id')`. The query service
calls `SET LOCAL app.tenant_id = $1` at the start of every transaction;
the connection-pool wrapper forbids queries before that setting is
established.

The RLS policy is **the single failure point** for Free isolation —
which is why we limit Free tenants to non-sensitive workloads (the
plan terms explicitly disallow PII / regulated workloads on Free, see
the shared-responsibility doc). For everyone else, Postgres RLS is a
**defense-in-depth layer**, not the primary boundary.

### 2.2 Schema-per-tenant (Starter, Pro)

Each tenant gets a Postgres schema (`tenant_${id}`). All tenant tables
live in that schema; the application code uses `SET search_path =
tenant_${id}, public` per transaction. A per-tenant Postgres role has
`USAGE` on its own schema and **explicit revocation** of `USAGE` on
every other tenant's schema.

A connection issued for tenant A is bound to role `tenant_a` at session
start (via `SET ROLE`). Even if the application code is buggy and
references the wrong schema, the role lacks privileges to read it. RLS
is enabled as a second layer (with the column-based check) so a bug
that subverts the role boundary still gets caught.

Schema-per-tenant scales to ~10,000 schemas per cluster before
`pg_namespace` query performance starts hurting. We shard tenants
across clusters at ~5,000 per cluster to leave headroom.

### 2.3 Database-per-tenant / dedicated cluster (Enterprise)

Two flavors:

- **Database-per-tenant on shared cluster** — the tenant has its own
  Postgres database (`tenant_${id}`), with its own role, its own
  connection pool, its own `pg_dump` schedule. Cross-database queries
  are impossible. This is the default Enterprise tier.
- **Dedicated cluster** — for tenants who need RPO/RTO guarantees
  independent of other tenants, CMEK key rotation on their own
  schedule, or compliance attestations that require physical
  separation (FedRAMP, certain financial regulators). The dedicated
  cluster runs the same software the shared clusters run; the only
  difference is operational ownership and the absence of co-tenants.

Enterprise can also opt to bring their own VPC ("BYO-cloud" topology
from the control-data-plane doc §6), in which case the dedicated
cluster runs inside the customer's VPC and Anthropic operates it via
a control-plane agent.

---

## 3. Kafka topic isolation (always per-tenant)

**Every tenant always gets a per-tenant Kafka topic**, regardless of
isolation tier. The topic name is `audit.tenant-${tenant_id}`. The
ACL is set by the control plane at tenant-creation time:

- The tenant's API-key principals have `Write` on their own topic.
- The data plane's ingestion gateway service principal has `Write` on
  all tenant topics (it is the ingestion writer).
- The data plane's audit-consumer service principal has `Read` on all
  tenant topics (it is the durable-store writer).
- The tenant's "stream tap" subscriber principal has `Read` on **only
  their tenant's topic**, never on others.

Per-tenant topics are not negotiable. The cost of one extra Kafka
topic per tenant is the **price of admission** for being a
multi-tenant SaaS — the alternative (shared topic with consumer-side
filtering) puts tenant separation in application code, which is
exactly where it tends to silently regress.

Topic retention is plan-driven (Free: 24h Kafka buffer, Pro: 72h,
Enterprise: 7 days). The durable record store (Postgres / S3) is the
source of truth; Kafka is the durability window for "we lost
Postgres, replay from the log."

---

## 4. Redis keyspace prefixing

Redis is used for:
- rate-limiter token buckets per tenant
- query-cache panels (dashboards)
- short-lived idempotency keys for ingestion (replay-dedup window)
- session caches for the console

Every key is prefixed with `t:<tenant_id>:` and the application-layer
Redis client wrapper enforces the prefix. A query without the prefix
is a runtime error in development and a logged-audit-event in
production. The Redis cluster is per-region; cross-region access does
not happen.

Why prefixing instead of separate Redis instances per tenant: Redis is
a cache, not a system of record. A bug that leaks one tenant's
rate-limiter state to another is a recoverable bug (the cache
self-heals on the next request); a bug that leaks records is not.
Investing in Redis-per-tenant isolation buys us very little when the
data on the other side (audit storage) has stronger isolation.

The single exception is the **kill-switch state cache**, which is
explicitly **per-tenant within a single Redis namespace** because that
is the design of `RuntimeContext` from ADR-103. The data plane's
local kill-switch cache stores `t:<tenant_id>:killswitch = bool`, and
the per-tenant `RuntimeContext.killSwitch.isKilled()` reads exactly
one key. This keeps the cache lookup O(1) and the failure mode
"cache miss" deterministic.

---

## 5. Per-tenant kill switch via `RuntimeContext` (ADR-103)

ADR-103 introduced `RuntimeContext` precisely so that hosted
multi-tenant deployments could have **independent kill switches per
tenant**. The hosted offering's responsibility, on top of ADR-103, is
the **fanout pipeline** that propagates a tenant kill switch to every
executor (in-VPC or hosted) that runs that tenant's traffic.

The fanout (planned hosted layer, from the control-data-plane doc §2.5):

```
   Console / API → control-plane.tenant_registry.kill_switch = true
                   └─▶ NATS JetStream subject
                       "control.tenant.${id}.killswitch.flipped"
                       │
                       ▼ subscribed in every data-plane region
                   region-cache.tenant_${id}.killswitch = true
                       │
                       ▼ polled by executors (TTL: 5s prod / 60s Free)
                   RuntimeContext(tenant_id).killSwitch.isKilled() == true
                       │
                       ▼ adjudicateAndAudit short-circuits → Decision = REFUSE
```

**The kernel's actual refusal contract** (what the hosted layer builds
on, do not invent fields): when a tenant `RuntimeContext` is killed,
`adjudicateAndAudit` short-circuits and emits

- refusal message code `"kill_switch_active"` (category `SECURITY`),
- `basis("kill", BASIS_CODES.kill.ACTIVE, { reason, toggledAt, tenant })`
  — the tenant id appears under `basis.detail.tenant`; `reason` and
  `toggledAt` come from the kill-switch state.

(See `packages/core/src/kernel/adjudicate-and-audit.ts:283-300`; the
process-wide switch in `adjudicate.ts:194-211` emits the same code with
`{ reason, toggledAt }` and no tenant.) Any hosted enrichment such as
`flipped_by` / `flipped_at` is an **additional control-plane audit row**
(see §7), not a change to this kernel basis.

ADR-103's `killSwitchEnvVar` option carries over: the per-region
environment override defaults to `IBX_KILL_SWITCH`
(`CreateRuntimeContextOptions.killSwitchEnvVar`,
`runtime-context.ts:382/398`). Tenant contexts opt in to a per-tenant
env var by the convention `IBX_KILL_SWITCH_TENANT_FOO`
(`runtime-context.ts:35`); set `killSwitchEnvVar` to that name on the
`RuntimeContext` handed to the executor. The "manual takes precedence
over env" rule from ADR-103 applies: a control-plane flip beats any
env-only state.

---

## 6. API-key scope claims

API keys are signed JWTs. The shape (omitting standard JWT registered
claims):

```
   {
     "tenant_id":        "01HVZN…",        // ULID
     "key_id":           "key_01HW…",      // for revocation lookups
     "key_version":      3,                // for rotation
     "principal_type":   "service_account" | "user",
     "principal_id":     "sa_01HW…" | "user_01HW…",
     "roles":            ["Operator"],     // exactly one role in v1.0
     "scopes":           ["audit:read", "audit:replay", "dlq:drain", …],
     "isolation_tier":   "schema",         // for query-service routing
     "region":           "us-east-1",      // home data-plane region
     "iat": …, "exp": …, "iss": "https://control.adjudicate.cloud", …
   }
```

Two claims are load-bearing for tenant isolation:

- **`tenant_id`** is the single ground truth for "whose data am I
  allowed to touch." Every data-plane component re-derives the
  Postgres `app.tenant_id` setting, the Redis key prefix, and the
  Kafka topic name from this claim. **Mismatch between the record
  payload's `tenantId` and the claim's `tenant_id` is the security
  boundary** — the ingestion gateway rejects the record (control-data-
  plane doc §3.1 step 4) and writes a security event.
- **`scopes`** is the union of capability strings derived from the
  role at minting time. **We embed the resolved scopes in the JWT
  rather than re-derive from the role at request time.** This is a
  considered trade-off:
  - *Pro:* the data plane never has to call the control plane to
    resolve "what does Operator mean today?" — the JWT carries the
    answer, and the role-to-scope mapping can evolve in the control
    plane without invalidating cached keys.
  - *Con:* if we add a new capability to the Operator role, existing
    keys minted before the change do not get it until they are
    rotated. We accept this — capability *removal* is more
    security-critical than capability *addition*, and removal is
    handled by key rotation (force-rotate on any scope reduction).

### 6.1 Signed JWT vs opaque token

We use **signed JWT for ingestion**, **opaque token for console
sessions**. Reasoning:

| Use case | Format | Why |
|---|---|---|
| **Ingestion** (every audit record carries an API key) | Signed JWT | Latency-sensitive; we cannot call the control plane on the hot path. JWKS caching gets us local verification. Lifetime is bounded (1 hour to 90 days, configurable). Revocation is handled by `key_version` bump + propagation. |
| **Console session** | Opaque token | Revocation matters more than latency (a user clicks "log out everywhere" and expects it to work in seconds). The console is allowed to call the control plane on every request — these are human-paced operations. |
| **CI / service account claim exchange** | Opaque → signed | Opaque token resolves to a JWT on first use, scoped to a single CI run. Combines auditability of opaque (revocable in one place) with hot-path performance of JWT (no online check per record). |

The JWKS rotation cadence is monthly with overlap (old + new key valid
simultaneously for 7 days). Revocation of a specific `key_id` is a
**short-lived denylist** propagated alongside the JWKS — a key marked
`revoked` overrides its signature. The denylist is bounded in size
because revoked keys naturally expire from their `exp` claim within
90 days at most.

---

## 7. Cross-cutting: what is identical across tiers

A few properties hold across all three isolation tiers, all five
roles, and all signing formats:

- **Every audit-write path is authenticated and tenant-scoped.** There
  is no anonymous ingestion. There is no "system" tenant that any
  caller can write to.
- **Every audit-read path enforces row-level filtering even when the
  schema or database boundary already enforces it.** Defense in depth
  catches a future bug where an isolation tier is misconfigured at
  provisioning time.
- **Every privileged action (kill switch, DLQ drain, key mint, role
  change) generates its own AuditRecord** — emitted from the control
  plane itself, into the tenant's audit log, with `basis.detail`
  carrying the principal who took the action. The hosted offering is
  itself audited by the same kernel it sells. *(Planned hosted-layer
  convention: these control-plane rows would use an envelope kind such
  as `hosted.privilege.${action}`. No such kind exists in the kernel
  today — `grep hosted.privilege` returns zero hits — so treat the exact
  kind as unbuilt until the control plane lands.)*

That last property is the one that closes the loop: an Operator who
flips a kill switch generates an audit record visible to that
tenant's Owner. There is no "control plane shadow log" the customer
cannot see — what we do on their behalf is in their audit log.

---

## 8. Open items deferred past v1.0

- **Scoped roles** (project-level rather than tenant-level) — committed
  for v1.1.
- **Per-resource ACLs** — under research; will require an ADR before
  v1.x ships.
- **SCIM provisioning** — committed for v1.1, Enterprise-tier only.
- **Just-in-time elevation** ("temporary Admin for 30 minutes") — on
  the long list, pending demand signal.

These are intentionally not in v1.0 — the goal is a small, sound,
well-understood RBAC surface that we can extend rather than
re-architect.
