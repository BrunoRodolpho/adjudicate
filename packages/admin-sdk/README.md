# @adjudicate/admin-sdk

> **Status: `0.1.0-experimental`** — read-only audit query surface only.
> Mutating procedures (replay, kill-switch, tenant enforcement) arrive in
> Phase 2 as additive procedures under new namespaces.

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

The framework does **not** ship: auth (adopter wraps), persistence (adopter implements `AuditStore`), or hosted infra (the SDK runs in the adopter's process).

---

## Surface map

```
@adjudicate/admin-sdk           — schemas, AuditStore, handler, in-memory ref
@adjudicate/admin-sdk/trpc      — adminRouter (tRPC v11)
@adjudicate/admin-sdk/adapters/next — toNextRouteHandler
```

## Implementing `AuditStore`

The adopter contract is two methods. Postgres / Memory / Kafka-archive / S3-cold all satisfy the same shape.

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

**Implementations MUST NOT**:
- Mutate records.
- Re-validate against Zod (the SDK already validated input).
- Return records that don't match the filter.

## Mounting the tRPC router (Next.js)

```ts
// app/api/admin/[trpc]/route.ts
import {
  adminRouter,
  toNextRouteHandler,
  createInMemoryAuditStore,
} from "@adjudicate/admin-sdk";

const store = createInMemoryAuditStore({ records: myRecords });

export const { GET, POST } = toNextRouteHandler({
  router: adminRouter,
  endpoint: "/api/admin",
  createContext: () => ({ store }),
});
```

For Express/Fastify/Hono, import `createAuditQueryHandler` directly and wire it into your router. The handler signature is `(input: AuditQuery) => Promise<AuditQueryResult>` — REST-native by construction.

## Schema drift policy

`@adjudicate/core` defines the canonical TypeScript types. `@adjudicate/admin-sdk` ships matching Zod schemas. Drift is caught by **three independent gates**:

1. **Build-time TS assignability** — each schema file declares `_coreToSchema` and `_schemaToCore` const functions whose bodies fail to compile if the schema and core type disagree.
2. **Runtime fixture roundtrip** — `tests/schemas-roundtrip.test.ts` parses one fixture per Decision kind through the schemas. Drift fails by name.
3. **CI gate** — root `pnpm -r test` runs both above as part of normal verification. A kernel change that breaks the SDK fails the workspace build.

If you edit a type in `packages/core/src/{decision,envelope,audit,refusal,basis-codes,taint}.ts`, update the matching schema in `packages/admin-sdk/src/schemas/`. CI will tell you if you forgot.

## What's not in this package

- **Mutating procedures** (replay, kill-switch, tenant enforcement) — Phase 2.
- **Auth** — adopter-supplied. Wrap the route handler with your auth middleware.
- **Postgres reference store** — separate package `@adjudicate/audit-postgres-store` (future).
- **Express/Fastify/Hono adapters** — community PRs welcome. The handler is framework-agnostic by design.
- **OpenAPI export** — possible from Zod via `zod-to-openapi` if a non-TS consumer ever appears.
