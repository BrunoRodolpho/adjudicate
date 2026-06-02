/**
 * Executing integration tests against a REAL migrated Postgres instance.
 *
 * Gated on `INTEGRATION_TEST=1` — by default the whole suite is `describe.skip`,
 * so the workspace `pnpm -r test` stays fast and needs no Docker, and `pg` is
 * never imported (the dynamic `import("pg")` lives inside `beforeAll`, which the
 * skipped suite never runs).
 *
 * ── What this suite pins (the cycle-32 activation blewup, now a standing guard) ──
 * The unit suite (postgres-sink.test.ts) asserts the `INSERT_AUDIT_SQL` *string*
 * but never EXECUTES it against the migrated schema. That blind spot hid a real
 * activation blocker for 32 cycles: `INSERT_AUDIT_SQL` uses
 *   ON CONFLICT (intent_hash, recorded_at) DO NOTHING
 * but migration 001 created `idx_intent_audit_intent_hash` as a NON-unique index,
 * so no arbiter matched and every real sink write failed with Postgres 42P10
 * ("there is no unique or exclusion constraint matching the ON CONFLICT
 * specification"). Post-activation that fails CLOSED on every audited mutation.
 * Migration `009-unique-intent-hash-recorded-at.sql` makes the index UNIQUE.
 *
 * This suite runs the PRODUCTION sink (`createPostgresSink`) bound to the
 * PRODUCTION `INSERT_AUDIT_SQL` + `auditInsertParams` against the real migrated
 * `intent_audit`, so migration 009 + the audit dedup semantics are permanently
 * pinned. If 009 regresses (the index reverts to non-unique), the "009 guard"
 * test below fails — the regression that survived 32 cycles can no longer hide.
 *
 * ── How to run it (repeatable; the cycle-32 proof was a one-shot deleted harness) ──
 *   1. Bring up the sandbox stack (from the ibatexas checkout):
 *        cd ../../../ibatexas && docker compose up -d --wait
 *   2. Provision the audit schema + monthly partitions (applies migrations 001–009):
 *        pnpm --filter @ibatexas/cli build && node packages/cli/dist/index.js kernel migrate
 *      (or: pnpm --filter @ibatexas/cli start kernel migrate)
 *   3. Run this suite against the live DB (from the audit-postgres package):
 *        cd ../adjudicate/packages/audit-postgres
 *        PG_TEST_URL=postgresql://ibatexas:ibatexas@localhost:5433/ibatexas pnpm integration
 *      (`pnpm integration` sets INTEGRATION_TEST=1; PG_TEST_URL falls back to
 *       DATABASE_URL. The suite needs the 2026-06 partition — the migrate step
 *       above creates [now-1 … now+3] months, so run it in/around June 2026 or
 *       pass a now that covers 2026-06.)
 *   4. Tear the stack down when done:
 *        cd ../../../ibatexas && docker compose down
 *
 * Non-destructive: every row this suite writes carries session_id
 * `__audit-postgres-integration__` and is deleted in beforeAll (pre-clean) and
 * afterAll. The 009-regression demonstration uses a throwaway table it drops.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASIS_CODES,
  basis,
  buildAuditRecord,
  buildEnvelope,
  decisionExecute,
} from "@adjudicate/core";
import type { AuditRecord } from "@adjudicate/core";
import {
  INSERT_AUDIT_SQL,
  auditInsertParams,
  createPostgresSink,
  recordToRow,
} from "../src/postgres-sink.js";

const INTEGRATION = process.env.INTEGRATION_TEST === "1";
const describeIntegration = INTEGRATION ? describe : describe.skip;

/** Connection string — explicit PG_TEST_URL, else the runtime DATABASE_URL. */
const CONN = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;

/** Marker so every row this suite writes is reliably cleanable, even after a crash. */
const TEST_SESSION = "__audit-postgres-integration__";

/**
 * Minimal structural Postgres surface this test needs — mirrors the
 * `PgClientLike` pattern in ibatexas' kernel-migrate.ts so the package keeps no
 * compile-time dependency on `pg`'s types (the real `pg.Pool`, injected at
 * runtime via a gated dynamic import, satisfies this shape).
 */
interface PgQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}
interface PgPoolLike {
  query(text: string, params?: ReadonlyArray<unknown>): Promise<PgQueryResult>;
  end(): Promise<void>;
}

/**
 * Build a real v4 AuditRecord with a real kernel intentHash. `marker` makes the
 * canonical envelope (hence the intentHash) unique per test so tests don't
 * collide; `at` is the audit recorded_at (the partition + ON CONFLICT key).
 */
function makeRecord(marker: string, at: string): AuditRecord {
  const env = buildEnvelope({
    kind: "order.item.add",
    payload: { sku: "costela-bovina", qty: 2, marker },
    actor: { principal: "llm", sessionId: TEST_SESSION },
    taint: "UNTRUSTED",
    nonce: `n-${marker}`,
    createdAt: "2026-06-15T12:00:00.000Z",
  });
  return buildAuditRecord({
    envelope: env,
    decision: decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT),
    ]),
    durationMs: 7,
    at,
  });
}

describeIntegration("integration — audit-postgres sink vs a real migrated DB", () => {
  let pool: PgPoolLike;

  /** The production sink, bound to a real pg-backed writer running INSERT_AUDIT_SQL. */
  function sinkFor(p: PgPoolLike) {
    return createPostgresSink({
      writer: {
        async insertAudit(row) {
          // The canonical adopter wiring: the SAME SQL + params the sink
          // documents. This is the production write path end-to-end.
          await p.query(INSERT_AUDIT_SQL, [...auditInsertParams(row)]);
        },
      },
    });
  }

  async function countByHashAndAt(intentHash: string, at: string): Promise<number> {
    const r = await pool.query(
      "SELECT count(*)::int AS n FROM intent_audit WHERE intent_hash = $1 AND recorded_at = $2",
      [intentHash, at],
    );
    return Number(r.rows[0]!.n);
  }
  async function countByHash(intentHash: string): Promise<number> {
    const r = await pool.query(
      "SELECT count(*)::int AS n FROM intent_audit WHERE intent_hash = $1",
      [intentHash],
    );
    return Number(r.rows[0]!.n);
  }

  beforeAll(async () => {
    if (!CONN) {
      throw new Error(
        "INTEGRATION_TEST=1 but no PG_TEST_URL/DATABASE_URL set. Bring up the " +
          "sandbox (cd ibatexas && docker compose up -d --wait; ibx kernel migrate) " +
          "and pass PG_TEST_URL=postgresql://ibatexas:ibatexas@localhost:5433/ibatexas. " +
          "See this file's header for the full run procedure.",
      );
    }
    // Real pg client, resolved only now (gated): default `pnpm test` never loads pg.
    const pg = (await import("pg")) as unknown as {
      default?: { Pool: new (cfg: { connectionString: string }) => PgPoolLike };
      Pool?: new (cfg: { connectionString: string }) => PgPoolLike;
    };
    const Pool = (pg.default?.Pool ?? pg.Pool)!;
    pool = new Pool({ connectionString: CONN });

    // Fail loudly with guidance if the schema/partition isn't provisioned.
    try {
      await pool.query("SELECT 1 FROM intent_audit WHERE false");
    } catch (err) {
      throw new Error(
        `intent_audit not found — run 'ibx kernel migrate' against ${CONN} first. ` +
          `Underlying: ${(err as Error).message}`,
      );
    }
    // Pre-clean any rows left by a prior crashed run.
    await pool.query("DELETE FROM intent_audit WHERE session_id = $1", [TEST_SESSION]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM intent_audit WHERE session_id = $1", [TEST_SESSION]);
      await pool.end();
    }
  });

  // ── 1. THE 009 REGRESSION GUARD (load-bearing) ────────────────────────────
  // The write that failed 42P10 before migration 009. If 009 is reverted (the
  // index goes back to non-unique), this emit rejects and the test fails — this
  // is the test that would have caught the bug the unit suite missed for 32 cycles.
  it("executes the production INSERT_AUDIT_SQL through the sink — the 42P10 write now succeeds (migration 009)", async () => {
    const rec = makeRecord("009-guard", "2026-06-15T12:00:00.000Z");
    const sink = sinkFor(pool);

    await expect(sink.emit(rec)).resolves.toBeUndefined();

    // Exactly one row persisted for this (intent_hash, recorded_at).
    expect(await countByHashAndAt(rec.intentHash, rec.at)).toBe(1);

    // Read-back fidelity: the row carries the kernel's intent_hash, decision, and
    // the v4 tamper-evidence hash (nothing silently dropped by the real write).
    const back = await pool.query(
      "SELECT decision_kind, principal, taint, audit_hash, partition_month FROM intent_audit WHERE intent_hash = $1 AND recorded_at = $2",
      [rec.intentHash, rec.at],
    );
    expect(back.rows).toHaveLength(1);
    expect(back.rows[0]!.decision_kind).toBe("EXECUTE");
    expect(back.rows[0]!.principal).toBe("llm");
    expect(back.rows[0]!.taint).toBe("UNTRUSTED");
    expect(back.rows[0]!.partition_month).toBe("2026-06");
    expect(back.rows[0]!.audit_hash).toBe(recordToRow(rec).audit_hash);
  });

  // ── 2. DEDUP — ON CONFLICT (intent_hash, recorded_at) DO NOTHING ──────────
  // The UNIQUE arbiter makes a same-instant re-emit idempotent (retry safety).
  it("re-emitting the SAME (intent_hash, recorded_at) is idempotent — still ONE row", async () => {
    const rec = makeRecord("dedup", "2026-06-15T12:05:00.000Z");
    const sink = sinkFor(pool);

    await sink.emit(rec);
    await sink.emit(rec); // identical record — ON CONFLICT DO NOTHING
    await sink.emit(rec);

    expect(await countByHashAndAt(rec.intentHash, rec.at)).toBe(1);
    expect(await countByHash(rec.intentHash)).toBe(1);
  });

  // ── 3. THE ARBITER ARBITRATES, NOT JUST EXISTS (parked-resume shape) ──────
  // Same intent_hash, a LATER recorded_at (the confirmation_resolved / re-adjudicate
  // shape) → a DISTINCT row. Proves the unique index discriminates on the full
  // (intent_hash, recorded_at) key — it dedups retries without collapsing the
  // append-only re-adjudication trail.
  it("same intent_hash at a LATER recorded_at writes a DISTINCT row (append-only)", async () => {
    const env = buildEnvelope({
      kind: "order.item.add",
      payload: { sku: "costela-bovina", qty: 2, marker: "append-only" },
      actor: { principal: "llm", sessionId: TEST_SESSION },
      taint: "UNTRUSTED",
      nonce: "n-append-only",
      createdAt: "2026-06-15T12:00:00.000Z",
    });
    const first = buildAuditRecord({
      envelope: env,
      decision: decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]),
      durationMs: 7,
      at: "2026-06-15T12:10:00.000Z",
    });
    const later = buildAuditRecord({
      envelope: env, // same envelope → same intentHash
      decision: decisionExecute([basis("state", BASIS_CODES.state.TRANSITION_VALID)]),
      durationMs: 7,
      at: "2026-06-15T12:11:00.000Z", // later recorded_at
    });
    expect(later.intentHash).toBe(first.intentHash); // hash is over the envelope, not `at`

    const sink = sinkFor(pool);
    await sink.emit(first);
    await sink.emit(later);

    expect(await countByHash(first.intentHash)).toBe(2);
    expect(await countByHashAndAt(first.intentHash, first.at)).toBe(1);
    expect(await countByHashAndAt(later.intentHash, later.at)).toBe(1);
  });

  // ── 4. PARTITION ROUTING ──────────────────────────────────────────────────
  // intent_audit is RANGE-partitioned by recorded_at; a June 2026 instant must
  // land in intent_audit_2026_06 (the partition the cycle-32 e2e turn proved).
  it("routes the row to the correct monthly partition (intent_audit_2026_06)", async () => {
    const rec = makeRecord("partition", "2026-06-15T12:15:00.000Z");
    const sink = sinkFor(pool);
    await sink.emit(rec);

    const r = await pool.query(
      "SELECT tableoid::regclass::text AS partition FROM intent_audit WHERE intent_hash = $1 AND recorded_at = $2",
      [rec.intentHash, rec.at],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.partition).toBe("intent_audit_2026_06");
  });

  // ── 5. ONE AUDIT ROW PER WRITE (the cutover's load-bearing invariant) ─────
  // At the persistence layer: a single sink.emit produces exactly one row for a
  // fresh intent_hash — the one-audit-row-before-the-side-effect guarantee.
  it("a single sink.emit persists exactly ONE row for a fresh intent_hash", async () => {
    const rec = makeRecord("one-row", "2026-06-15T12:20:00.000Z");
    expect(await countByHash(rec.intentHash)).toBe(0); // fresh

    await sinkFor(pool).emit(rec);

    expect(await countByHash(rec.intentHash)).toBe(1);
  });

  // ── 6. MIGRATION 009 IS APPLIED TO THE REAL TABLE (direct schema guard) ───
  // The arbiter the sink's ON CONFLICT depends on must be UNIQUE on the live
  // intent_audit. If 009 regressed, indisunique is false and this fails.
  it("idx_intent_audit_intent_hash on intent_audit is UNIQUE (migration 009 applied)", async () => {
    const r = await pool.query(
      `SELECT i.indisunique
         FROM pg_class c
         JOIN pg_index i  ON i.indrelid   = c.oid
         JOIN pg_class ic ON ic.oid       = i.indexrelid
        WHERE c.relname  = 'intent_audit'
          AND ic.relname = 'idx_intent_audit_intent_hash'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    expect(r.rows[0]!.indisunique).toBe(true);
  });

  // ── 7. PROVE THE GUARD CATCHES A 009 REGRESSION (non-destructive demo) ────
  // Reproduce the cycle-32 failure mechanic on a throwaway table: the sink's
  // `ON CONFLICT (intent_hash, recorded_at)` clause fails 42P10 against a
  // NON-unique index (the pre-009 state) and succeeds once the index is UNIQUE
  // (the 009 fix). This establishes that test #1 is a real regression guard:
  // revert 009 and the identical ON CONFLICT write fails exactly here.
  it("demonstrates the regression: the sink's ON CONFLICT fails 42P10 without a UNIQUE arbiter, succeeds with it", async () => {
    const T = "__it_009_regression_probe";
    const insert =
      `INSERT INTO ${T} (intent_hash, recorded_at, val) VALUES ($1, $2, $3) ` +
      `ON CONFLICT (intent_hash, recorded_at) DO NOTHING`;
    const params = ["a".repeat(64), "2026-06-15T12:00:00.000Z", "x"];
    try {
      await pool.query(`DROP TABLE IF EXISTS ${T}`);
      await pool.query(
        `CREATE TABLE ${T} (intent_hash text NOT NULL, recorded_at timestamptz NOT NULL, val text)`,
      );
      // pre-009 shape: a NON-unique index on the ON CONFLICT target.
      await pool.query(`CREATE INDEX ${T}_idx ON ${T} (intent_hash, recorded_at)`);

      // The sink's exact ON CONFLICT target has no matching unique/exclusion
      // constraint → Postgres 42P10 (the cycle-32 activation blocker, reproduced).
      let code: string | undefined;
      try {
        await pool.query(insert, params);
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code).toBe("42P10");

      // Apply the 009 fix: make the arbiter UNIQUE.
      await pool.query(`DROP INDEX ${T}_idx`);
      await pool.query(`CREATE UNIQUE INDEX ${T}_idx ON ${T} (intent_hash, recorded_at)`);

      // The identical ON CONFLICT write now succeeds (and is idempotent).
      await expect(pool.query(insert, params)).resolves.toBeDefined();
      await expect(pool.query(insert, params)).resolves.toBeDefined(); // DO NOTHING
      const n = await pool.query(`SELECT count(*)::int AS n FROM ${T}`);
      expect(Number(n.rows[0]!.n)).toBe(1);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${T}`);
    }
  });
});
