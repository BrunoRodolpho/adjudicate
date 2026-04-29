/**
 * `PostgresReader` — adopter-supplied read-side query interface.
 *
 * Mirrors the existing `PostgresWriter` pattern in `postgres-sink.ts`:
 * adopters wrap their Postgres client (pg, postgres.js, Prisma's
 * `$queryRaw`) into this minimal shape; the package stays
 * framework-agnostic and adds no `pg` runtime dep.
 *
 * The reference console ships its own `pg.Pool`-backed adapter at
 * `apps/console/src/lib/postgres-pool.ts` so adopters who prefer
 * pg.Pool have a copy-pasteable example.
 */
export interface PostgresReader {
  /**
   * Run a parameterized query and return rows as objects.
   *
   * Implementations MUST:
   *   - Use parameterized queries ($1, $2, ...) — never string-concatenate
   *     params into the SQL.
   *   - Return rows in the order Postgres produced them (do not re-sort).
   *   - Coerce TIMESTAMPTZ to ISO-8601 strings, OR return as native
   *     `Date` (the package's row mappers normalize either form).
   *
   * Implementations MUST NOT:
   *   - Mutate the input SQL or params.
   *   - Cache results across calls (pagination correctness depends on
   *     fresh reads).
   */
  query<R>(sql: string, params: readonly unknown[]): Promise<readonly R[]>;
}

/**
 * Optional companion writer for governance events. Adopters who only
 * use this package for reads (e.g., a Postgres writer is configured
 * elsewhere) can skip implementing this. The Phase 1.5c durable
 * emergency-state composite uses it; future Phase 2 mutating procedures
 * extend the same interface.
 */
export interface PostgresGovernanceWriter {
  insertGovernanceEvent(row: import("./governance-events.js").GovernanceEventRow): Promise<void>;
}
