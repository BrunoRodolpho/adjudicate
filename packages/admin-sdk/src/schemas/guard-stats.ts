import { z } from "zod";
import { DecisionKindSchema } from "./decision.js";
import { IsoTimestampSchema } from "./common.js";

export const GuardPhaseSchema = z.enum(["state", "taint", "auth", "business"]);
export type GuardPhase = z.infer<typeof GuardPhaseSchema>;

/**
 * `guardFireStats({ since, packId })` query. `since` is an inclusive lower
 * bound (`day >= since`) — the rolling window runs from `since` to now,
 * consistent with the APIReviewer-003 inclusive `[since, until]` boundary
 * convention used across the audit read surface (see `AuditQuerySchema`).
 */
export const GuardFireStatsQuerySchema = z.object({
  since: IsoTimestampSchema,
  packId: z.string().optional(),
});
export type GuardFireStatsQuery = z.infer<typeof GuardFireStatsQuerySchema>;

export const GuardFireBucketSchema = z.object({
  guardName: z.string(),
  guardPhase: GuardPhaseSchema,
  decisionKind: DecisionKindSchema,
  day: z.string(),
  count: z.number().int().nonnegative(),
});
export type GuardFireBucket = z.infer<typeof GuardFireBucketSchema>;

export const GuardFireStatsResultSchema = z.object({
  buckets: z.array(GuardFireBucketSchema),
});
export type GuardFireStatsResult = z.infer<typeof GuardFireStatsResultSchema>;
