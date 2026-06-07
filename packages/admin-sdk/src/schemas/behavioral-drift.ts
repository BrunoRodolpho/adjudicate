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

/**
 * Wire schema for the bounded drift-history TIME-SERIES (ADR-132). Mirrors
 * `@adjudicate/drift`'s `DriftHistoryView` structurally so admin-sdk carries no
 * dependency on that package — the console wires a `DriftHistory` and threads
 * its `view()` (filtered by the query) through context. Each entry is a
 * per-dimension TVD + alert-count roll-up of a detector snapshot, never the raw
 * baseline/recent category maps (those stay on the single-point
 * `behavioralDrift` snapshot).
 */
export const DriftHistoryDimensionEntrySchema = z.object({
  dimension: DriftDimensionNameSchema,
  tvd: z.number(),
  alertCount: z.number().int().nonnegative(),
});

export const DriftHistoryEntrySchema = z.object({
  /** ISO-8601, harness-supplied (the producer never reads a clock). */
  at: z.string().datetime(),
  /** Monotonic, eviction-stable insertion counter. */
  seq: z.number().int().nonnegative(),
  totalObserved: z.number().int().nonnegative(),
  maxTvd: z.number(),
  alertCount: z.number().int().nonnegative(),
  dimensions: z.array(DriftHistoryDimensionEntrySchema),
});

export const DriftHistoryResultSchema = z.object({
  /** Pinned for dashboards (ADR-119 lifecycle). */
  schemaVersion: z.literal(1),
  /** Ring-buffer cardinality bound. */
  capacity: z.number().int().positive(),
  /** Entries currently retained (<= capacity). */
  count: z.number().int().nonnegative(),
  /** Total entries evicted oldest-first since construction/reset. */
  dropped: z.number().int().nonnegative(),
  /** Retained timeline, oldest -> newest, length <= the query `limit`. */
  entries: z.array(DriftHistoryEntrySchema),
});

export type DriftHistoryDimensionEntryParsed = z.infer<
  typeof DriftHistoryDimensionEntrySchema
>;
export type DriftHistoryEntryParsed = z.infer<typeof DriftHistoryEntrySchema>;
export type DriftHistoryResultParsed = z.infer<typeof DriftHistoryResultSchema>;

/**
 * Input for `governance.driftHistory`. `limit` caps how many of the most-recent
 * retained entries are returned (the timeline is windowed to the last N points);
 * the adopter's `query(input)` honours it. Bounded so a dashboard request can't
 * ask for an unbounded series.
 */
export const DriftHistoryQuerySchema = z.object({
  limit: z.number().int().positive().max(500).default(100),
});

export type DriftHistoryQuery = z.infer<typeof DriftHistoryQuerySchema>;
