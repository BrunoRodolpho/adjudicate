import { z } from "zod";

/**
 * Wire schema for a behavioral-drift snapshot (ADR-119). Mirrors
 * `@adjudicate/drift`'s `DriftSnapshot` structurally so admin-sdk carries no
 * dependency on that package — the console wires a detector and threads its
 * `snapshot()` through context.
 */
export const DriftDimensionNameSchema = z.enum([
  "decision.kind",
  "intent.kind",
  "basis",
]);

export const DriftSignalKindSchema = z.enum([
  "distribution_shift",
  "new_category",
  "proportion_spike",
]);

export const DriftAlertSchema = z.object({
  dimension: DriftDimensionNameSchema,
  signal: DriftSignalKindSchema,
  magnitude: z.number(),
  threshold: z.number(),
  category: z.string().optional(),
  baselineCount: z.number().int().nonnegative(),
  recentCount: z.number().int().nonnegative(),
});

export const DriftDimensionSnapshotSchema = z.object({
  dimension: DriftDimensionNameSchema,
  baseline: z.record(z.string(), z.number()),
  recent: z.record(z.string(), z.number()),
  tvd: z.number(),
  alerts: z.array(DriftAlertSchema),
});

export const BehavioralDriftResultSchema = z.object({
  schemaVersion: z.literal(1),
  baselineWindow: z.number().int().nonnegative(),
  recentWindow: z.number().int().nonnegative(),
  alertThreshold: z.number(),
  totalObserved: z.number().int().nonnegative(),
  dimensions: z.array(DriftDimensionSnapshotSchema),
});

export type BehavioralDriftResultParsed = z.infer<typeof BehavioralDriftResultSchema>;
