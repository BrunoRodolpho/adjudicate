import { z } from "zod";
import { DecisionKindSchema } from "./decision.js";

export const GuardPhaseSchema = z.enum(["state", "taint", "auth", "business"]);
export type GuardPhase = z.infer<typeof GuardPhaseSchema>;

export const GuardFireStatsQuerySchema = z.object({
  since: z.string().min(1),
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
