import type { AuditStore } from "../store/index.js";
import type {
  OutcomeBucket,
  OutcomeDistributionQuery,
  OutcomeDistributionResult,
} from "../schemas/outcome-distribution.js";
import type { AuditQueryResult } from "../schemas/query.js";

/**
 * Framework-agnostic outcome-distribution handler.
 *
 * Computes a per-bucket histogram of `Decision.kind` over a window.
 *
 * Default strategy: iterates `store.query` paginating up to a configurable
 * cap. Real Postgres adapters implement `OutcomeDistributionStore` for
 * native server-side aggregation; the default in-memory path is sufficient
 * for dev / small footprints (the AuditStore caps at 500 records per query
 * — for 30-day stats the handler will under-count when there are >500
 * records in the window; production adopters MUST plug in a native
 * aggregator).
 */
export interface OutcomeDistributionStore {
  outcomeDistribution(
    query: OutcomeDistributionQuery,
  ): Promise<OutcomeDistributionResult>;
}

export interface CreateOutcomeDistributionHandlerDeps {
  readonly store: AuditStore | (AuditStore & OutcomeDistributionStore);
  /**
   * Optional override for the bucket-cap when iterating the AuditStore. In
   * production Postgres adapters that implement
   * `OutcomeDistributionStore`, this is ignored. Defaults to the AuditStore
   * `query.limit` cap of 500.
   */
  readonly fallbackQueryLimit?: number;
  /**
   * Clock injection for the `until`-defaults-to-"now" behavior
   * (APIReviewer-005). Defaults to `() => new Date().toISOString()`. Override
   * in tests to produce a deterministic window.
   */
  readonly clock?: () => string;
}

const EMPTY_COUNTS: OutcomeBucket = Object.freeze({
  at: "",
  EXECUTE: 0,
  REFUSE: 0,
  REWRITE: 0,
  DEFER: 0,
  ESCALATE: 0,
  REQUEST_CONFIRMATION: 0,
}) as OutcomeBucket;

function bucketKey(iso: string, granularity: "hour" | "day"): string {
  return granularity === "hour" ? `${iso.slice(0, 13)}:00:00.000Z` : `${iso.slice(0, 10)}T00:00:00.000Z`;
}

function aggregateRecords(
  records: AuditQueryResult["records"],
  query: OutcomeDistributionQuery,
): OutcomeDistributionResult {
  const map = new Map<string, OutcomeBucket>();
  for (const r of records) {
    if (r.at < query.since) continue;
    if (query.until && r.at > query.until) continue;
    const key = bucketKey(r.at, query.bucket);
    const prior = map.get(key) ?? { ...EMPTY_COUNTS, at: key };
    map.set(key, { ...prior, [r.decision.kind]: prior[r.decision.kind] + 1 });
  }
  const buckets = Array.from(map.values()).sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  return { buckets };
}

function hasNativeAggregator(
  store: AuditStore | (AuditStore & OutcomeDistributionStore),
): store is AuditStore & OutcomeDistributionStore {
  return typeof (store as OutcomeDistributionStore).outcomeDistribution === "function";
}

export function createOutcomeDistributionHandler(
  deps: CreateOutcomeDistributionHandlerDeps,
): (input: OutcomeDistributionQuery) => Promise<OutcomeDistributionResult> {
  const limit = deps.fallbackQueryLimit ?? 500;
  const clock = deps.clock ?? (() => new Date().toISOString());
  return async (input) => {
    // Resolve the documented `until`-defaults-to-"now" behavior at request
    // time (APIReviewer-005). Both the native and fallback paths see the
    // same resolved upper bound, so the window is identical regardless of
    // which aggregator the store provides.
    const until = input.until ?? clock();
    if (hasNativeAggregator(deps.store)) {
      return deps.store.outcomeDistribution({ ...input, until });
    }
    // Fallback: iterate audit records in the window. The AuditStore cap is
    // a real ceiling — callers needing more should plug in
    // OutcomeDistributionStore.
    const { records } = await deps.store.query({
      since: input.since,
      until,
      limit,
    });
    return aggregateRecords(records, { ...input, until });
  };
}
