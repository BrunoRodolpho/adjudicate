/**
 * Catch telemetry store (item 7) — counts "caught a bad call" events fed from
 * the adapter loop's `onCatch` hook.
 *
 * # Determinism boundary
 *
 * Like `token-usage-store`, this is TELEMETRY strictly OUTSIDE the determinism
 * boundary — it powers a console card, never a kernel decision. No clock, no RNG
 * on any recorded value (`at` is adopter-supplied). Tool cardinality is bounded
 * by an LRU so a flood of distinct tool names cannot grow the store without
 * bound — and per the plan, `toolName` is span/event-only, never a metric label.
 *
 * Scope note: this counts the OUT_OF_PLAN catch path only. REWRITE "catches"
 * are already counted by the outcome distribution (the console card SUMS the two
 * into one "caught N bad calls" headline) — this store does not double-count.
 */

/** One caught out-of-plan tool call. */
export interface CatchSample {
  readonly toolName: string;
  readonly reason: "out_of_plan";
  /** Originating session, when known. */
  readonly sessionId?: string;
  /** Adopter-supplied ISO timestamp. The store never calls Date.now(). */
  readonly at: string;
}

/** Aggregated catch counts (read-model for the admin port / console card). */
export interface CatchCounts {
  readonly total: number;
  readonly byReason: Readonly<Record<string, number>>;
  /** Newest-count-first; bounded by the tool LRU. */
  readonly byTool: ReadonlyArray<{ readonly toolName: string; readonly count: number }>;
}

export interface CatchUsageStore {
  /** Fold one catch into the counters. */
  record(sample: CatchSample): void;
  /** Aggregated counts. */
  counts(): CatchCounts;
  /** Total catches recorded (== sum of byReason). */
  total(): number;
}

export interface CreateInMemoryCatchUsageStoreOptions {
  /** LRU bound on distinct tool names. Default 1_000. */
  readonly maxTools?: number;
}

const DEFAULT_MAX_TOOLS = 1_000;

/**
 * In-memory `CatchUsageStore`. Clock/RNG-free on every recorded value; bounded
 * tool cardinality via an insertion-ordered LRU Map (mirrors the token store).
 */
export function createInMemoryCatchUsageStore(
  opts: CreateInMemoryCatchUsageStoreOptions = {},
): CatchUsageStore {
  const maxTools = Math.max(1, opts.maxTools ?? DEFAULT_MAX_TOOLS);
  const byTool = new Map<string, number>();
  const byReason = new Map<string, number>();
  let totalCount = 0;

  return {
    record(sample: CatchSample): void {
      totalCount += 1;
      byReason.set(sample.reason, (byReason.get(sample.reason) ?? 0) + 1);
      const prev = byTool.get(sample.toolName);
      // LRU touch: re-insert at the end to mark most-recently-used.
      if (prev !== undefined) byTool.delete(sample.toolName);
      byTool.set(sample.toolName, (prev ?? 0) + 1);
      while (byTool.size > maxTools) {
        const oldest = byTool.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        byTool.delete(oldest);
      }
    },

    counts(): CatchCounts {
      const tools = [...byTool.entries()].map(([toolName, count]) => ({ toolName, count }));
      tools.sort((a, b) => (b.count - a.count) || a.toolName.localeCompare(b.toolName));
      return {
        total: totalCount,
        byReason: Object.fromEntries(byReason),
        byTool: tools,
      };
    },

    total(): number {
      return totalCount;
    },
  };
}
