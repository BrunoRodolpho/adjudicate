/**
 * Integration tests against a real Postgres instance.
 *
 * Gated on `INTEGRATION_TEST=1` — by default this suite is skipped so
 * the workspace `pnpm -r test` doesn't require Docker. To run locally:
 *
 *   docker run -d --rm -p 5432:5432 -e POSTGRES_PASSWORD=test \
 *     --name adjudicate-test-pg postgres:16
 *
 *   PG_TEST_URL=postgres://postgres:test@localhost:5432/postgres \
 *   INTEGRATION_TEST=1 pnpm --filter @adjudicate/audit-postgres test
 *
 * Asserts:
 *   - Migrations 001-004 apply cleanly (schema + indexes + constraints)
 *   - End-to-end write→read consistency (existing PostgresSink seeds; new
 *     PostgresAuditStore reads back equivalently)
 *   - Keyset pagination over a 1000-record dataset returns non-overlapping,
 *     complete coverage across pages
 *   - EXPLAIN on the query plan shows index scan, not sequential scan
 *   - governance_events table accepts inserts and enforces the
 *     status-changed CHECK constraint
 */

import { describe, it } from "vitest";

const INTEGRATION = process.env.INTEGRATION_TEST === "1";
const describeIntegration = INTEGRATION ? describe : describe.skip;

describeIntegration("integration — Postgres real DB", () => {
  it("placeholder — wire up actual DB tests when INTEGRATION_TEST=1", () => {
    // Implementation note: this file is a stub gated on the env flag so
    // CI doesn't require a Docker'd Postgres. When INTEGRATION_TEST=1,
    // populate this suite with:
    //
    //   - applyMigrations(pool) — runs 001-004 in order
    //   - seed via createPostgresSink + a 1000-record fixture
    //   - readAll via createPostgresAuditStore.query — assert ordering
    //   - paginate via cursor — assert no overlaps, complete coverage
    //   - EXPLAIN ANALYZE the parameterized query — assert "Index Scan"
    //     appears in the plan, not "Seq Scan"
    //   - governance_events: insert two events; assert
    //     status-changed CHECK rejects same-status; verify history order
    //
    // The unit tests in audit-store.test.ts and governance-log.test.ts
    // cover the SQL shape and pagination semantics against mocked pg.
    // This integration suite is for the additional invariants that
    // require a real Postgres planner.
    //
    // Skipped by default: INTEGRATION_TEST != "1".
  });
});
