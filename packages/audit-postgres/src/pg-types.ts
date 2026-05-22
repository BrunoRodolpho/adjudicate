/**
 * Shared pg-driver value coercion helpers.
 *
 * Different pg drivers materialize `TIMESTAMPTZ` columns differently:
 *   - `node-postgres` / `pg.Pool` parses the value into a native `Date`.
 *   - `postgres.js` returns the wire-format string verbatim.
 *   - Prisma's `$queryRaw` typically returns `Date`.
 *
 * The package row mappers (`rowToRecord`, `rowToGovernanceEvent`, …) accept
 * either shape and normalize through this helper so callers always see an
 * ISO-8601 string.
 */

/**
 * Coerce a pg-driver TIMESTAMPTZ value to an ISO-8601 string.
 *
 * Accepts `string` (already ISO-8601) or `Date` (native pg.Pool shape).
 * Throws a diagnostic error including the offending value when neither
 * shape matches — the only realistic cause is a driver bug or a misuse
 * of the reader contract, both of which deserve loud failure.
 *
 * `column` is used only for diagnostics (the error message tells the
 * operator which TIMESTAMPTZ column was malformed). When omitted the
 * error stays informative but generic.
 */
export function normalizeTimestamptz(value: unknown, column?: string): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  const where = column ? ` (column: ${column})` : "";
  const sample =
    value === null
      ? "null"
      : `${typeof value}: ${safeSample(value)}`;
  throw new Error(
    `audit-postgres: unexpected TIMESTAMPTZ value${where} — expected string or Date, got ${sample}`,
  );
}

function safeSample(value: unknown): string {
  try {
    const s = typeof value === "object" ? JSON.stringify(value) : String(value);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return "<unserializable>";
  }
}
