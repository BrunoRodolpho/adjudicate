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
