# @adjudicate/admin-sdk

> **Status: `2.1.0`** — stable wire contract. Read and mutating procedures both ship.

The **Admin Query Interface (AQI)** for the adjudicate framework. This
package owns the **wire contract** between an adopter's deployed audit
infrastructure and any consuming UI (the reference `@adjudicate/console`,
or an adopter-built one).

The framework ships:
- **Zod schemas** that validate payloads at the wire boundary
- An **`AuditStore` interface** the adopter implements against their persistence
- A framework-agnostic **handler factory** for raw HTTP wiring
- A **tRPC router** for TypeScript-end-to-end consumers
- A **Next.js Route Handler adapter** (the canonical case; other frameworks are 5-line ports)

The framework does **not** ship: auth (adopter wraps), persistence (adopter implements `AuditStore` and the optional read/mutation ports), or hosted infra (the SDK runs in the adopter's process).

---

## Surface map

```
@adjudicate/admin-sdk           — schemas, AuditStore, handler, in-memory ref
@adjudicate/admin-sdk/trpc      — adminRouter (tRPC v11)
@adjudicate/admin-sdk/adapters/next — toNextRouteHandler
```

`adminRouter` exposes seven namespaces (see `src/trpc/index.ts`):

| Namespace | What it covers |
|-----------|----------------|
| `audit` | `query` / `byHash` — read kernel-emitted decision audits (actor-gated). |
| `emergency` | `state` / `history` (read) + `update` (mutation) — operator kill switch. |
| `replay` | `run` (mutation) — re-adjudicate a historical record against current policy. |
| `governance` | distributions, drift, red-team, token-budget, config-seal, policy descriptor/manifest reads + `recordOutcome` (mutation). |
| `approval` | `list` / `history` / `chain` (read) + `resolve` (mutation) — confirmation engine. |
| `pack` | `aiBom` / `aiBomList` / `aiBomById` — AI Bill-of-Materials reads. |
| `memory` | `bySession` — cross-session memory snapshot read. |

Optional surfaces (governance/approval/pack/memory beyond the base reads)
are **feature-detected at runtime**: each procedure throws
`PRECONDITION_FAILED` when its backing port is not wired into `AdminContext`,
so the procedure shape stays static across adopters.

## Authentication & actors

Every record-level read and every mutation requires an authenticated actor,
resolved by the adopter's `createContext` via `extractActor(req)` from the
`x-adjudicate-actor-id` header (plus optional `-name` / `-tenant`):

- `audit.query` / `audit.byHash` and the record-level governance drill-downs
  (`piiEvents`, `commandRiskEvents`) throw `UNAUTHORIZED` with no actor — audit
  reads are **not** open.
- Mutations (`emergency.update`, `replay.run`, `governance.recordOutcome`,
  `approval.resolve`) throw `UNAUTHORIZED` with no actor.
- Aggregate-only stats (`outcomeDistribution`, `piiClassificationStats`,
  `commandRisk`) leak no per-record data and do not require an actor.

`extractActor` does **not** authenticate — it trusts the headers. The
`toNextRouteHandler` adapter takes a `requireAuth` gate (REQUIRED in
production; the handler throws at construction without it) that runs before
every request. Wrap your IdP session check there (see the `next.ts` JSDoc for
Clerk / OIDC recipes).

## Implementing `AuditStore`

The adopter read contract is two methods. Postgres / Memory / Kafka-archive / S3-cold all satisfy the same shape.

```ts
import type { AuditStore } from "@adjudicate/admin-sdk";

export const myPostgresStore: AuditStore = {
  async query(filters) {
    const rows = await db.query(
      `SELECT * FROM intent_audit
       WHERE ($1::text IS NULL OR envelope->>'kind' = $1)
         AND ($2::text IS NULL OR decision->>'kind' = $2)
         AND ($3::timestamptz IS NULL OR at >= $3)
       ORDER BY at DESC
       LIMIT $4`,
      [filters.intentKind, filters.decisionKind, filters.since, filters.limit],
    );
    return { records: rows.map(rowToAuditRecord) };
  },
  async getByIntentHash(intentHash) {
    const row = await db.queryOne(
      `SELECT * FROM intent_audit WHERE intent_hash = $1`,
      [intentHash],
    );
    return row ? rowToAuditRecord(row) : null;
  },
};
```

**Implementations MUST**:
- Return records newest-first by `at` (ISO-8601 string sort = chronological).
- Honor `query.limit` exactly. The schema caps it at 500.
- Apply all provided filter fields with AND semantics.
- Surface persistence failures by throwing — the SDK converts to a tRPC `INTERNAL_SERVER_ERROR` with safe message.
- For multi-tenant stores, honor the optional `getByIntentHash` `tenantScope` and never return a record outside it.

**Implementations MUST NOT**:
- Mutate records.
- Re-validate against Zod (the SDK already validated input).
- Return records that don't match the filter.

## Mounting the tRPC router (Next.js)

`AdminContext` requires `store`, `emergencyStore`, and `actor` (the optional
ports — `replayer`, `approvalPort`, `outcomeSink`, `aiBom`, etc. — are wired in
only for the surfaces you expose):

```ts
// app/api/admin/[trpc]/route.ts
import {
  adminRouter,
  toNextRouteHandler,
  createInMemoryAuditStore,
  extractActor,
} from "@adjudicate/admin-sdk";

const store = createInMemoryAuditStore({ records: myRecords });

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin",
  requireAuth: withClerkAuth, // REQUIRED in production
  createContext: (req) => ({
    store,
    emergencyStore: myEmergencyStore,
    actor: extractActor(req),
  }),
});
```

For Express/Fastify/Hono, import `createAuditQueryHandler` directly and wire it into your router. The handler signature is `(input: AuditQuery) => Promise<AuditQueryResult>` — REST-native by construction.

## Schema drift policy

`@adjudicate/core` defines the canonical TypeScript types. `@adjudicate/admin-sdk` ships matching Zod schemas. Drift is caught by **three independent gates**:

1. **Build-time TS assignability** — the schemas that mirror a core type carry
   `_coreToSchema` / `_schemaToCore` const guards whose bodies fail to compile
   if the schema and core type disagree (e.g. `src/schemas/envelope.ts`, which
   mirrors `core/src/envelope.ts` + `taint.ts`). Most schemas in
   `src/schemas/` are AQI-only (governance, approval, pack, token-budget, …)
   with no core counterpart to guard.
2. **Runtime fixture roundtrip** — `tests/schemas-roundtrip.test.ts` parses one fixture per Decision kind through the schemas. Drift fails by name.
3. **CI gate** — root `pnpm -r test` runs both above as part of normal verification. A kernel change that breaks the SDK fails the workspace build.

If you edit a core type that a schema mirrors (`packages/core/src/{decision,envelope,audit,refusal,basis-codes,taint}.ts`), update the matching file in `packages/admin-sdk/src/schemas/`. CI will tell you if you forgot.

## What's not in this package

- **Auth** — adopter-supplied. Pass `requireAuth` to the route handler / wrap with your auth middleware.
- **Persistence & ports** — adopter implements `AuditStore` and any optional read/mutation ports (`replayer`, `approvalPort`, `outcomeSink`, AI-BOM, drift, token-budget, …).
- **Postgres reference store** — separate package `@adjudicate/audit-postgres-store` (future).
- **Express/Fastify/Hono adapters** — community PRs welcome. The handler is framework-agnostic by design.
- **OpenAPI export** — possible from Zod via `zod-to-openapi` if a non-TS consumer ever appears.
