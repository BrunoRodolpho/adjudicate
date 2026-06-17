import pg from "pg";

/**
 * Lazy `pg.Pool` for the adjutant's P4 Postgres-backed projection stores
 * (createPostgresRemediationProposalStore + createPostgresIncidentProjection).
 * Points at the SAME database the adopter (ibatexas) writes — its agent_runs +
 * remediation_proposals tables are the projection source. The pool is only
 * opened when DATABASE_URL is set; demo deployments never touch Postgres.
 */
const DATABASE_URL = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (pool) return pool;
  if (!DATABASE_URL) {
    throw new Error(
      "[adjutant postgres-pool] DATABASE_URL is not set. Set it to enable the " +
        "Postgres-backed projection stores, or do not call getPgPool().",
    );
  }
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  return pool;
}

export function isPostgresBacked(): boolean {
  return Boolean(DATABASE_URL);
}
