import pg from "pg";
import {
  governanceInsertParams,
  INSERT_GOVERNANCE_EVENT_SQL,
  type PostgresGovernanceWriter,
  type PostgresReader,
} from "@adjudicate/audit-postgres";

/**
 * `pg.Pool`-backed adapters for the @adjudicate/audit-postgres reader and
 * governance writer interfaces. The reference implementation — adopters
 * who don't use `pg` directly fork these adapters or write their own
 * wrapping `postgres.js`, Prisma's `$queryRaw`, etc.
 *
 * The pool is lazy: only constructed on the first call when DATABASE_URL
 * is set. `pg` is a hard dep of the console (always installed), but the
 * pool is never opened in MOCK / no-DATABASE_URL deployments.
 */

// Snapshot DATABASE_URL once at module load so config can't drift mid-process
// (a later mutation of process.env.DATABASE_URL must not change which database
// the already-decided pool targets). The pool is still constructed lazily on
// first call; only the resolved connection string is frozen here. `undefined`
// when unset — the "throw if unset" behavior below is preserved against this
// snapshot.
const DATABASE_URL = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (pool) return pool;
  if (!DATABASE_URL) {
    throw new Error(
      "[postgres-pool] DATABASE_URL is not set. Either set it to enable the Postgres-backed stores, or do not call getPgPool().",
    );
  }
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  return pool;
}

/** PostgresReader adapter wrapping `pg.Pool.query`. */
export function createPgPoolReader(pool: pg.Pool): PostgresReader {
  return {
    async query<R>(sql: string, params: readonly unknown[]) {
      const result = await pool.query(sql, [...params]);
      return result.rows as R[];
    },
  };
}

/** PostgresGovernanceWriter adapter wrapping `pg.Pool.query`. */
export function createPgPoolGovernanceWriter(
  pool: pg.Pool,
): PostgresGovernanceWriter {
  return {
    async insertGovernanceEvent(row) {
      await pool.query(INSERT_GOVERNANCE_EVENT_SQL, [
        ...governanceInsertParams(row),
      ]);
    },
  };
}
