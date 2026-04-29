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

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[postgres-pool] DATABASE_URL is not set. Either set it to enable the Postgres-backed stores, or do not call getPgPool().",
    );
  }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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
