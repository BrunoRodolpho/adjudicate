import { z } from "zod";
import { IsoTimestampSchema } from "./common.js";
import { DecisionKindSchema } from "./decision.js";

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

/**
 * Input for `governance.piiEvents` (ADR-129) — event-level drill-down of
 * data-classification dispositions over an inclusive `[since, until]` window,
 * with optional sensitivity/disposition filters and a result cap.
 */
export const PiiEventsQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
  sensitivityLevel: SensitivityLevelSchema.optional(),
  disposition: PiiDispositionSchema.optional(),
  packId: z.string().optional(),
  /** Max events to return (handler caps at 500). */
  limit: z.number().int().positive().max(500).optional(),
});

export type PiiEventsQuery = z.infer<typeof PiiEventsQuerySchema>;

/**
 * One data-classification disposition event — a single (record × PII basis)
 * occurrence. Carries ONLY non-sensitive metadata to support an operator
 * drill-down (link to the Decision Detail by `intentHash`). It NEVER includes
 * the redacted field values, field paths, or the raw payload — those never
 * leave the kernel into an AuditRecord and must never appear here.
 */
export const PiiEventSchema = z.object({
  intentHash: z.string(),
  at: IsoTimestampSchema,
  intentKind: z.string(),
  decisionKind: DecisionKindSchema,
  sensitivityLevel: SensitivityLevelSchema,
  disposition: PiiDispositionSchema,
});

export type PiiEvent = z.infer<typeof PiiEventSchema>;

export const PiiEventsResultSchema = z.object({
  events: z.array(PiiEventSchema),
  /** True when the window held more matching events than `limit`. */
  truncated: z.boolean(),
});

export type PiiEventsResult = z.infer<typeof PiiEventsResultSchema>;
