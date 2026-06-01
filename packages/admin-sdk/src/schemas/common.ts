import { z } from "zod";

/**
 * ISO-8601 datetime string, validated at the admin-sdk wire boundary.
 *
 * All timestamp fields on admin-sdk wire inputs and outputs use this schema —
 * `since` / `until` on query requests and `at` on outcome/audit records — so a
 * single rigor level applies everywhere (APIReviewer-004 / -010). Rejects
 * non-ISO strings (e.g. "yesterday", "2024-13-01", "") that the looser
 * `z.string().min(1)` / bare `z.string()` previously let through.
 *
 * Note: `z.infer` of this schema is `string` (identical to `z.string()`), so
 * core→schema drift guards that assign a core `string` timestamp into a
 * schema-inferred field continue to compile unchanged.
 */
export const IsoTimestampSchema = z.string().datetime();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

/**
 * sha256 hex digest — 64 lowercase hex characters. Used for `intentHash`
 * fields on both request inputs and wire response shapes (APIReviewer-013).
 *
 * Rejects empty strings, truncated hashes, uppercase hex, and non-hex content
 * that the looser `z.string()` / `z.string().min(1)` previously let through —
 * an `intentHash: ""` filter on `audit.query` is now a wire-level bad request,
 * not a silent "empty result".
 *
 * Note: `z.infer` of this schema is `string` (identical to `z.string()`), so
 * core→schema drift guards that assign a core `string` hash into a
 * schema-inferred field continue to compile unchanged.
 */
export const IntentHashSchema = z.string().regex(/^[0-9a-f]{64}$/, {
  message: "intentHash must be a 64-character lowercase hex string (sha256)",
});
export type IntentHash = z.infer<typeof IntentHashSchema>;
