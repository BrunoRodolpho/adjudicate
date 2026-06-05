/**
 * GuardFireStats — in-memory accumulator of guard fire counts.
 *
 * A LearningSink that bucketizes (guardName, guardPhase, decisionKind, day)
 * tuples into rolling-window counters. Used by the console governance page
 * to render "which guards fire how often and produce which decisions" charts.
 *
 * **In-memory by design.** Survives process restart through the optional
 * `PersistentStore` adapter (Phase 1.5C). The default accumulator is a Map
 * keyed by `(guardName|guardPhase|decisionKind|day)`. Total memory cost is
 * bounded by `O(packs × guards × decisions × days)` — for a typical adopter
 * (3 packs, ~30 guards, 6 decisions, 30 days) this is ~16k entries, well
 * inside JS heap budgets.
 *
 * Query results are filtered by the rolling-window cutoff at read time —
 * stale buckets older than the window are excluded but not deleted (callers
 * may want longer windows on a subsequent query). Compaction is a future
 * concern wrapped behind `PersistentStore`.
 */

import type { LearningEvent, LearningSink } from "./learning.js"
import { recordSinkFailure } from "./metrics.js"

export type GuardPhase = "state" | "taint" | "auth" | "business"

export interface GuardFireBucket {
  readonly guardName: string
  readonly guardPhase: GuardPhase
  readonly decisionKind: LearningEvent["decisionKind"]
  /** YYYY-MM-DD UTC. */
  readonly day: string
  readonly count: number
}

export interface GuardFireStatsQuery {
  /** ISO-8601 lower bound (inclusive). Buckets with `day >= since[:10]` count. */
  readonly since: string
  /** Optional pack filter — applied by the caller before invoking record(). */
  readonly packId?: string
}

/**
 * Adapter for persisting stats to durable storage. When supplied, every
 * `record()` writes through (best-effort — write failures do not block
 * telemetry) and every `query()` first reads from durable storage before
 * unioning with in-memory.
 */
export interface GuardFireStatsStore {
  write(bucket: GuardFireBucket): void | Promise<void>
  readSince(since: string, packId?: string): readonly GuardFireBucket[] | Promise<readonly GuardFireBucket[]>
}

export interface GuardFireStatsOptions {
  /** Optional persistent backing store (Phase 1.5C). */
  readonly store?: GuardFireStatsStore
  /**
   * Optional pack-resolver: given an intentKind, return the packId. When
   * supplied, the `packId` is attached to each bucket so queries can filter
   * by pack. Without a resolver, packId remains undefined and pack filtering
   * is a no-op.
   */
  readonly resolvePackId?: (intentKind: string) => string | undefined
  /**
   * MemoryReviewer-003: hard cap on the number of in-memory buckets. When the
   * accumulator exceeds this many distinct `(guard, phase, decision, day, pack)`
   * tuples, the oldest buckets (lowest `day`) are compacted away on write —
   * a rolling window that keeps recent telemetry hot and bounds heap.
   *
   * In-memory telemetry only — eviction never affects adjudication output, and
   * a `store` (when supplied) retains the full history regardless of this cap.
   * Defaults to {@link DEFAULT_MAX_BUCKETS}.
   */
  readonly maxBuckets?: number
}

/**
 * Default in-memory bucket cap. Sized for a generous adopter (more packs /
 * guards / a wider day window than the typical ~16k estimate above) while
 * still bounding heap so a long-lived process cannot grow the accumulator
 * without limit. Override via {@link GuardFireStatsOptions.maxBuckets}.
 */
export const DEFAULT_MAX_BUCKETS = 100_000

const dayKey = (iso: string): string => iso.slice(0, 10)

function makeMemoKey(b: Omit<GuardFireBucket, "count"> & { packId?: string }): string {
  return `${b.guardName}|${b.guardPhase}|${b.decisionKind}|${b.day}|${b.packId ?? ""}`
}

/**
 * In-memory accumulator. Implements `LearningSink` so it can be plugged into
 * `RuntimeContext.learning` or `setLearningSink()` directly.
 */
export class GuardFireStats implements LearningSink {
  private readonly memo = new Map<string, GuardFireBucket & { packId?: string }>()
  private readonly store?: GuardFireStatsStore
  private readonly resolvePackId?: (intentKind: string) => string | undefined
  private readonly maxBuckets: number

  constructor(options: GuardFireStatsOptions = {}) {
    this.store = options.store
    this.resolvePackId = options.resolvePackId
    const requested = options.maxBuckets ?? DEFAULT_MAX_BUCKETS
    // A non-positive cap would compact every bucket immediately, silently
    // disabling telemetry — clamp to at least 1.
    this.maxBuckets = requested > 0 ? Math.floor(requested) : 1
  }

  /**
   * Rolling-window compaction: while the accumulator exceeds `maxBuckets`,
   * evict the bucket(s) with the oldest `day`. Buckets sharing the oldest day
   * are evicted in insertion order (Map iteration order) so the eviction is
   * deterministic. Telemetry-only — never touches decision output.
   */
  private compact(): void {
    while (this.memo.size > this.maxBuckets) {
      let oldestKey: string | undefined
      let oldestDay: string | undefined
      for (const [key, bucket] of this.memo) {
        if (oldestDay === undefined || bucket.day < oldestDay) {
          oldestDay = bucket.day
          oldestKey = key
        }
      }
      if (oldestKey === undefined) break
      this.memo.delete(oldestKey)
    }
  }

  recordOutcome(event: LearningEvent): void {
    if (!event.guardName || !event.guardPhase) return
    const bucket: GuardFireBucket & { packId?: string } = {
      guardName: event.guardName,
      guardPhase: event.guardPhase,
      decisionKind: event.decisionKind,
      day: dayKey(event.at),
      count: 1,
      ...(this.resolvePackId
        ? { packId: this.resolvePackId(event.intentKind) }
        : {}),
    }
    const key = makeMemoKey(bucket)
    const prior = this.memo.get(key)
    const merged: GuardFireBucket & { packId?: string } = prior
      ? { ...prior, count: prior.count + 1 }
      : bucket
    this.memo.set(key, merged)
    // MemoryReviewer-003: bound the in-memory accumulator. Only a brand-new
    // bucket can grow the map, so compaction after a merge is a cheap no-op.
    if (prior === undefined) this.compact()
    if (this.store) {
      // Write the per-event DELTA (`bucket`, count: 1), NOT the running total
      // (`merged`). The store is an additive accumulator — its upsert does
      // `count = count + EXCLUDED.count` (see audit-postgres UPSERT_GUARD_STAT_SQL,
      // whose param is literally `countDelta`). Writing the cumulative `merged`
      // here made the store accumulate triangular sums (1, 1+2, 3+3, … = N(N+1)/2).
      // Best-effort write; telemetry must not block adjudication.
      try {
        const maybe = this.store.write(bucket)
        if (maybe && typeof (maybe as Promise<void>).catch === "function") {
          // ConcurrencyReviewer-009: async write failure is best-effort but
          // observable — route to telemetry instead of discarding silently.
          ;(maybe as Promise<void>).catch((err: unknown) => {
            recordSinkFailure({
              sink: "guard-fire-stats",
              subject: bucket.guardName,
              errorClass: err instanceof Error ? err.name : "Error",
              consecutiveFailures: 1,
            })
          })
        }
      } catch (err) {
        // Sync store.write() throw — route to telemetry, do not block
        // adjudication (ConcurrencyReviewer-009).
        recordSinkFailure({
          sink: "guard-fire-stats",
          subject: bucket.guardName,
          errorClass: err instanceof Error ? err.name : "Error",
          consecutiveFailures: 1,
        })
      }
    }
  }

  /**
   * Snapshot of all in-memory buckets that satisfy the window + pack filter.
   * Does NOT consult the persistent store — see `queryAsync` for the
   * union of memory + store.
   */
  query(q: GuardFireStatsQuery): readonly GuardFireBucket[] {
    const sinceDay = dayKey(q.since)
    return Array.from(this.memo.values())
      .filter((b) => b.day >= sinceDay)
      .filter((b) => (q.packId ? b.packId === q.packId : true))
      .map(({ packId: _packId, ...rest }) => rest)
  }

  /**
   * Durable view of the stats. Used by the admin-sdk query handler.
   *
   * When a `store` is configured it is the source of truth: every `record()`
   * writes a +1 delta through to it, and its additive upsert aggregates the
   * total (across replicas, too). The in-memory `memo` is a per-replica
   * write-through copy of the SAME events, so unioning the two would
   * double-count — hence we return the store's reads directly. Memory is the
   * fallback only when no store is configured.
   *
   * Caveat: a store write is best-effort (it must never block adjudication),
   * so an event whose write failed is reflected in `memo` but not the store
   * and will be absent here — an acceptable gap for best-effort telemetry,
   * and the opposite of the prior over-count.
   */
  async queryAsync(
    q: GuardFireStatsQuery,
  ): Promise<readonly GuardFireBucket[]> {
    if (!this.store) return this.query(q)
    return await this.store.readSince(q.since, q.packId)
  }
}
