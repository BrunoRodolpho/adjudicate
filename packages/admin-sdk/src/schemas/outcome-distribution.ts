import { z } from "zod";
import { DecisionKindSchema } from "./decision.js";
import { IsoTimestampSchema } from "./common.js";

/**
 * Input schema for the `outcomeDistribution` procedure.
 *
 * Inclusive `[since, until]` window (APIReviewer-003 boundary convention —
 * same as `AuditQuerySchema`).
 *
 * - `since` is a required ISO-8601 inclusive lower bound: records with
 *   `at >= since` count.
 * - `until` is an inclusive upper bound (`at <= until`). When omitted, the
 *   handler resolves "now" via its injected `clock` at request time
 *   (APIReviewer-005) — the schema itself stays clock-free for deterministic
 *   testing.
 * - `bucket` is the bucket granularity. "hour" returns up to ~744 entries
 *   for a 31-day window; "day" returns up to ~31.
 */
export const OutcomeDistributionQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
  bucket: z.enum(["hour", "day"]),
});

export type OutcomeDistributionQuery = z.infer<
  typeof OutcomeDistributionQuerySchema
>;

/**
 * A single bucket in the outcome-distribution time series. The bucket
 * timestamp (`at`) is the bucket's leading edge.
 *
 * Counts for every Decision kind are included as 0 for absent kinds — the
 * console renderer benefits from a stable shape across all buckets.
 */
export const OutcomeBucketSchema = z.object({
  at: z.string(),
  EXECUTE: z.number().int().nonnegative(),
  REFUSE: z.number().int().nonnegative(),
  REWRITE: z.number().int().nonnegative(),
  DEFER: z.number().int().nonnegative(),
  ESCALATE: z.number().int().nonnegative(),
  REQUEST_CONFIRMATION: z.number().int().nonnegative(),
});

export type OutcomeBucket = z.infer<typeof OutcomeBucketSchema>;

export const OutcomeDistributionResultSchema = z.object({
  buckets: z.array(OutcomeBucketSchema),
});

export type OutcomeDistributionResult = z.infer<
  typeof OutcomeDistributionResultSchema
>;

// Sanity: every key in the OutcomeBucket counts corresponds to a real
// Decision kind. Fails compile if the Decision enum drifts.
type _OutcomeBucketCoversDecisionKind =
  z.infer<typeof DecisionKindSchema> extends keyof OutcomeBucket
    ? true
    : false;
const _bucketCoverage: _OutcomeBucketCoversDecisionKind = true;
void _bucketCoverage;
