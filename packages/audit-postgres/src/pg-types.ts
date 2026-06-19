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

/**
 * Coerce a pg-driver `BIGINT` column value to a JS `number`.
 *
 * Different pg drivers materialize `BIGINT` differently: `node-postgres`
 * returns it as a `string` (to avoid silent precision loss past 2^53), while
 * some drivers return a `number`. The guard-stats / reservation `count` column
 * (migration-006 `BIGINT`) flows through this helper so callers always see a
 * `number`.
 *
 * 053 — the reservation store shares the `audit_guard_stats.count` (`BIGINT`)
 * column with the additive guard-stats counter, so its read-back path coerces
 * the same way. Counts are small aggregate tallies well within `Number`'s safe
 * integer range; a value past `Number.MAX_SAFE_INTEGER` (which a real cumulative
 * cap should never approach) throws loudly rather than returning a silently
 * lossy number — a lossy cap read would be a correctness hazard for the
 * over-commit guard, so it deserves loud failure.
 */
export function coerceBigIntCount(value: unknown, column?: string): number {
  const where = column ? ` (column: ${column})` : "";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `audit-postgres: unexpected BIGINT value${where} — number is not a safe integer, got ${value}`,
      );
    }
    return value;
  }
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error(
        `audit-postgres: unexpected BIGINT value${where} — bigint exceeds the safe integer range, got ${value}`,
      );
    }
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `audit-postgres: unexpected BIGINT value${where} — string is not a parseable integer, got string: ${safeSample(value)}`,
      );
    }
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(
        `audit-postgres: unexpected BIGINT value${where} — string exceeds the safe integer range, got string: ${safeSample(value)}`,
      );
    }
    return parsed;
  }
  const sample =
    value === null ? "null" : `${typeof value}: ${safeSample(value)}`;
  throw new Error(
    `audit-postgres: unexpected BIGINT value${where} — expected string, number, or bigint, got ${sample}`,
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
