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
      // Best-effort write; telemetry must not block adjudication.
      try {
        const maybe = this.store.write(merged)
        if (maybe && typeof (maybe as Promise<void>).catch === "function") {
          ;(maybe as Promise<void>).catch(() => {})
        }
      } catch {
        // ignore — store writes are best-effort
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
   * Union of persistent-store reads and in-memory state. Used by the
   * admin-sdk query handler.
   */
  async queryAsync(
    q: GuardFireStatsQuery,
  ): Promise<readonly GuardFireBucket[]> {
    const memBuckets = this.query(q)
    if (!this.store) return memBuckets
    const storeBuckets = await this.store.readSince(q.since, q.packId)
    return mergeBuckets(storeBuckets, memBuckets)
  }
}

/**
 * Sum counts across two bucket lists by (guardName, guardPhase, decisionKind, day).
 * The persistent-store representation may have already coalesced rows that
 * the in-memory accumulator is still tracking individually — adding both
 * preserves the invariant "store wins when present, memory adds delta".
 */
function mergeBuckets(
  a: readonly GuardFireBucket[],
  b: readonly GuardFireBucket[],
): readonly GuardFireBucket[] {
  const memo = new Map<string, GuardFireBucket>()
  for (const x of [...a, ...b]) {
    const k = makeMemoKey(x)
    const prior = memo.get(k)
    memo.set(k, prior ? { ...prior, count: prior.count + x.count } : x)
  }
  return Array.from(memo.values())
}
