import { z } from "zod";
import { RedTeamSummarySchema } from "./red-team.js";

/**
 * Wire schema for the bounded red-team run-history surface (ADR-133). Mirrors
 * `@adjudicate/red-team`'s `RedTeamHistoryView` structurally so admin-sdk
 * carries no dependency on that package — the console runs the suite across
 * `PackRegistry.all()`, records each report into an
 * `@adjudicate/red-team` history store, and threads its `view()` (filtered by
 * the query) through context, exactly as `governance.redTeam` threads the
 * single-shot report.
 *
 * `RedTeamRunRecord` is one immutable history row keyed by a content `digest`
 * (`digestRedTeamReport`, timing-excluded) + a harness-supplied `at` — the
 * producer never reads a clock. `RedTeamTrendPoint` is the defended/escaped/
 * error count series an operator charts over runs.
 */
export const RedTeamRunRecordSchema = z.object({
  /** "0x…" content digest from `digestRedTeamReport` — the run identity. */
  digest: z.string().regex(/^0x[0-9a-f]+$/),
  /** ISO-8601, harness-supplied (the producer never reads a clock). */
  at: z.string().datetime(),
  packId: z.string(),
  /** The run's outcome counts; reuses the frozen producer summary shape. */
  summary: RedTeamSummarySchema,
});

export const RedTeamTrendPointSchema = z.object({
  at: z.string().datetime(),
  packId: z.string(),
  total: z.number().int().nonnegative(),
  defended: z.number().int().nonnegative(),
  escaped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

export const RedTeamHistoryResultSchema = z.object({
  /** Retained run records, newest-first within each pack. */
  runs: z.array(RedTeamRunRecordSchema),
  /** Chronological (oldest → newest) trend points, one per retained run. */
  trend: z.array(RedTeamTrendPointSchema),
});

/**
 * Input for `governance.redTeamHistory`. `packId` restricts to a single pack's
 * runs/trend; `limit` caps how many of the most-recent retained runs per pack
 * are returned. Bounded so a dashboard request can't ask for an unbounded
 * series.
 */
export const RedTeamHistoryQuerySchema = z.object({
  packId: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export type RedTeamRunRecordParsed = z.infer<typeof RedTeamRunRecordSchema>;
export type RedTeamTrendPointParsed = z.infer<typeof RedTeamTrendPointSchema>;
export type RedTeamHistoryResultParsed = z.infer<typeof RedTeamHistoryResultSchema>;
export type RedTeamHistoryQuery = z.infer<typeof RedTeamHistoryQuerySchema>;
