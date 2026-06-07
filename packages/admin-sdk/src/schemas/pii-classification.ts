import { z } from "zod";
import { IsoTimestampSchema } from "./common.js";

/**
 * Input for `governance.piiClassificationStats` — aggregates data-classification
 * dispositions (ADR-117) over an inclusive `[since, until]` window.
 *
 * - `since` required ISO-8601 lower bound (`at >= since`).
 * - `until` optional inclusive upper bound; handler resolves "now" via its
 *   injected clock when omitted (same convention as outcome-distribution).
 * - `packId` optional filter (reserved; counts are derived from the audit
 *   record's `decision_basis` which is pack-agnostic).
 */
export const PiiClassificationQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
  packId: z.string().optional(),
});

export type PiiClassificationQuery = z.infer<typeof PiiClassificationQuerySchema>;

export const SensitivityLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const PiiDispositionSchema = z.enum(["redacted", "blocked"]);

/** One (sensitivityLevel × disposition) count bucket. */
export const PiiClassificationBucketSchema = z.object({
  sensitivityLevel: SensitivityLevelSchema,
  disposition: PiiDispositionSchema,
  count: z.number().int().nonnegative(),
});

export type PiiClassificationBucket = z.infer<typeof PiiClassificationBucketSchema>;

export const PiiClassificationResultSchema = z.object({
  buckets: z.array(PiiClassificationBucketSchema),
});

export type PiiClassificationResult = z.infer<typeof PiiClassificationResultSchema>;
