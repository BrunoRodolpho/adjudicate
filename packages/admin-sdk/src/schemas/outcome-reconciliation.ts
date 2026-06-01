import { z } from "zod";
import { IntentHashSchema, IsoTimestampSchema } from "./common.js";

/**
 * Wire schemas for the `governance.recordOutcome` mutation and
 * `governance.decisionAccuracy` query — the SA2 Rec 6 reconciliation
 * surface. Wide-but-bounded shape; the underlying core API is strict.
 */

export const ObservedOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "withdrawn",
]);

export const RetrospectiveOutcomeSchema = z.object({
  intentHash: IntentHashSchema,
  observed: ObservedOutcomeSchema,
  at: IsoTimestampSchema,
  // 2000-char cap mirrors core's RetrospectiveOutcomeWireSchema exactly
  // (APIReviewer-011) — an unbounded note must not pass SDK wire validation
  // when the core sink rejects it.
  note: z.string().max(2000).optional(),
});
export type RetrospectiveOutcomeParsed = z.infer<
  typeof RetrospectiveOutcomeSchema
>;

/**
 * `decisionAccuracy({ since, until })` window. Inclusive bounds `[since,
 * until]` (APIReviewer-003 boundary convention — same as `AuditQuerySchema`).
 */
export const DecisionAccuracyQuerySchema = z.object({
  since: IsoTimestampSchema,
  until: IsoTimestampSchema.optional(),
});
export type DecisionAccuracyQuery = z.infer<typeof DecisionAccuracyQuerySchema>;

/**
 * Result of `decisionAccuracy({ since, until })`. `total` is the count of
 * EXECUTE records in the window; `matched` is the count of those whose
 * outcome reconciled (in any direction); `succeeded` is the subset
 * observed `succeeded`. The console renders {succeeded / matched} and
 * {matched / total} as separate ratios.
 */
export const DecisionAccuracyResultSchema = z.object({
  total: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  withdrawn: z.number().int().nonnegative(),
});
export type DecisionAccuracyResult = z.infer<typeof DecisionAccuracyResultSchema>;
