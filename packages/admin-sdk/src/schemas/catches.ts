import { z } from "zod";

/**
 * Wire schema for "caught a bad call" telemetry (item 7).
 *
 * Aggregated counts of out-of-plan tool calls the adapter loop blocked, fed from
 * the adapter's `onCatch` hook into an adopter-supplied `CatchUsageStore`
 * (`@adjudicate/adapter-core`). The console's "caught N bad calls" card SUMS
 * `total` here with the existing REWRITE-outcome bucket.
 *
 * DETERMINISM: telemetry, outside the determinism boundary — never a kernel
 * input. `byTool` is span/event-cardinality (adopter/model-controlled), bounded
 * by the store's LRU.
 */
export const CatchCountsResultSchema = z.object({
  total: z.number().int().nonnegative(),
  byReason: z.record(z.string(), z.number().int().nonnegative()),
  byTool: z.array(
    z.object({
      toolName: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type CatchCountsResult = z.infer<typeof CatchCountsResultSchema>;
