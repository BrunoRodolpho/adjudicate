import type { GuardFireStats } from "@adjudicate/core";
import type {
  GuardFireBucket,
  GuardFireStatsQuery,
  GuardFireStatsResult,
} from "../schemas/guard-stats.js";

/**
 * Framework-agnostic guard-fire-stats handler.
 *
 * Reads from a `GuardFireStats` instance (typically the one installed via
 * RuntimeContext.learning). The handler returns `queryAsync` results, so a
 * persistent store attached to the GuardFireStats is queried first and
 * unioned with in-memory state.
 */
export interface CreateGuardFireStatsHandlerDeps {
  readonly stats: GuardFireStats;
}

export function createGuardFireStatsHandler(
  deps: CreateGuardFireStatsHandlerDeps,
): (input: GuardFireStatsQuery) => Promise<GuardFireStatsResult> {
  return async (input) => {
    const buckets = await deps.stats.queryAsync(input);
    // Convert readonly array to mutable for schema compatibility — the
    // schema models the wire shape, which the trpc result serializer treats
    // as plain JSON.
    return { buckets: [...buckets] as GuardFireBucket[] };
  };
}
