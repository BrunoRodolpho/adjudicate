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
 * Coerce a pg-driver TIMESTAMPTZ value to a CANONICAL ISO-8601 string.
 *
 * Accepts `Date` (native pg.Pool shape) or `string` (the `postgres.js`
 * wire-format shape, e.g. `"2026-05-18 00:00:00+00"`, possibly with
 * microsecond precision). Both are normalized to the canonical JavaScript
 * ISO-8601 form (`YYYY-MM-DDTHH:mm:ss.SSSZ`).
 *
 * DataReviewer-013 (option B): this read-side faithfulness is load-bearing.
 * `record.at` (and `governance_events.at`) flow through this helper into the
 * value `verifyAuditRecord` re-hashes — and `at` is part of the v4 auditHash
 * pre-image. Returning a wire-format string verbatim (the previous behavior)
 * made the read-back `at` diverge from the millisecond ISO form hashed at write
 * time, tripping a FALSE-POSITIVE tamper. Parse-and-reemit fixes the round-trip
 * without touching the core hash recipe. A canonical ISO input is idempotent
 * through `new Date(s).toISOString()`, so existing golden vectors do not move.
 *
 * Throws a diagnostic error (including the offending value) when the value is
 * neither a Date nor a parseable timestamp string — a driver bug or a misuse of
 * the reader contract, both of which deserve loud failure. `column` is used
 * only for diagnostics; when omitted the error stays informative but generic.
 */
export function normalizeTimestamptz(value: unknown, column?: string): string {
  if (value instanceof Date) return value.toISOString();
  const where = column ? ` (column: ${column})` : "";
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    throw new Error(
      `audit-postgres: unexpected TIMESTAMPTZ value${where} — string is not a parseable timestamp, got string: ${safeSample(value)}`,
    );
  }
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
