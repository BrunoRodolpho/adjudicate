/**
 * Integration tests against a real Postgres instance.
 *
 * Gated on `INTEGRATION_TEST=1` — by default this suite is skipped so the
 * workspace `pnpm -r test` doesn't require Docker.
 *
 * ── cycle-32 activation finding (the gap this stub must eventually close) ──
 * The unit suite (postgres-sink.test.ts) asserts the `INSERT_AUDIT_SQL` *string*
 * but never EXECUTES it against the migrated schema. That blind spot hid a real
 * activation blocker: `INSERT_AUDIT_SQL` uses
 *   ON CONFLICT (intent_hash, recorded_at) DO NOTHING
 * (idempotent audit writes) but migration 001 created
 * `idx_intent_audit_intent_hash` as a NON-unique index, so no arbiter matched
 * and every real sink write failed with Postgres 42P10 ("no unique or exclusion
 * constraint matching the ON CONFLICT specification"). Post-activation that
 * fails CLOSED on every audited mutation. Fixed by migration
 * `009-unique-intent-hash-recorded-at.sql` (makes the index UNIQUE).
 *
 * The fix is proven live: the cycle-32 E2E harness ran `createPostgresSink` +
 * `INSERT_AUDIT_SQL` against the live migrated DB (with 009 applied) and the
 * audited write succeeded (intent_audit 0→1, one row before the side-effect).
 *
 * ── follow-up: wire this as an executing regression test ──
 * `@adjudicate/audit-postgres` intentionally has NO `pg` dependency (the sink
 * takes an injected `PostgresWriter`), so an executing test needs `pg` added as
 * a devDependency here. With that, populate this suite (gated INTEGRATION_TEST=1,
 * PG_TEST_URL pointing at a migrated DB with a partition for the write window):
 *
 *   const pool = new Pool({ connectionString: process.env.PG_TEST_URL });
 *   const sink = createPostgresSink({ writer: { insertAudit: (r) =>
 *     pool.query(INSERT_AUDIT_SQL, auditInsertParams(r)) } });
 *   // 1. sink.emit(record)            → resolves (the 42P10 regression);
 *   // 2. sink.emit(SAME record)       → still ONE row (ON CONFLICT dedup);
 *   // 3. sink.emit(SAME hash, LATER recorded_at) → TWO rows (parked-resume);
 *   //    clean up the probe rows by intent_hash afterward.
 *
 * Until that lands, the unit suite covers the SQL shape and migration 009 +
 * the live E2E cover execution. Skipped by default: INTEGRATION_TEST != "1".
 */

import { describe, it } from "vitest";

const INTEGRATION = process.env.INTEGRATION_TEST === "1";
const describeIntegration = INTEGRATION ? describe : describe.skip;

describeIntegration("integration — Postgres real DB", () => {
  it("placeholder — wire up actual DB tests when INTEGRATION_TEST=1 (see file header)", () => {
    // See the file header for the exact suite to populate and why the executing
    // ON CONFLICT-arbiter assertion is the load-bearing one (cycle-32 finding).
  });
});
