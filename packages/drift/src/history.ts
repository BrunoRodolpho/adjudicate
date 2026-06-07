import type { DriftDimension, DriftSnapshot } from "./detector.js";

/**
 * Bounded, deterministic snapshot-history accumulator (ADR-132).
 *
 * `createDriftHistory` records `DriftSnapshot` results — produced by a
 * `DriftDetector.snapshot()` — into a fixed-capacity ring buffer keyed by a
 * CALLER-SUPPLIED `at` timestamp + a monotonic `seq`. It gives the operator a
 * drift TIME-SERIES (is a TVD spike new / recovering / sustained?) that the
 * single-point `snapshot()` cannot.
 *
 * Determinism (ADR-119 discipline, preserved):
 *   - No wall-clock and no RNG on any path. `record(snapshot, at)` takes the
 *     timestamp explicitly; the package never calls `Date.now()`. Two histories
 *     fed the same `(snapshot, at)` sequence produce byte-identical `view()`s.
 *   - `seq` is a pure monotonic insertion counter that survives eviction, so a
 *     dropped entry never collapses two distinct points onto one `seq`.
 *
 * Bounded cardinality (ADR-119): retention is capped at `capacity` entries,
 * oldest evicted first (FIFO). `dropped` exposes the eviction total so a
 * dashboard never silently loses history without a signal. Each retained
 * snapshot is itself already cardinality-bounded by the detector
 * (`maxCategoriesPerDimension` + `__overflow__`), so total payload is fixed.
 *
 * Outside the determinism boundary by construction: the kernel never reads this,
 * nothing here reaches `intentHash`/`adjudicate()`/policy/state, and the buffer
 * is in-process telemetry — never a system of record.
 */

/** A per-dimension roll-up of a recorded snapshot (TVD + alert count). */
export interface DriftHistoryDimensionEntry {
  readonly dimension: DriftDimension;
  readonly tvd: number;
  readonly alertCount: number;
}

/** One recorded point in the drift timeline (oldest -> newest in a view). */
export interface DriftHistoryEntry {
  /** ISO-8601, CALLER-SUPPLIED — never `Date.now()`. */
  readonly at: string;
  /** Monotonic insertion counter, deterministic and eviction-stable. */
  readonly seq: number;
  /** Total observations the detector had seen when this snapshot was taken. */
  readonly totalObserved: number;
  /** Largest per-dimension TVD across the snapshot. 0 when no dimensions. */
  readonly maxTvd: number;
  /** Total alerts across every dimension of the snapshot. */
  readonly alertCount: number;
  /** Per-dimension TVD + alert-count roll-up, in snapshot dimension order. */
  readonly dimensions: ReadonlyArray<DriftHistoryDimensionEntry>;
}

/** A read of the retained timeline plus its bounding metadata. */
export interface DriftHistoryView {
  /** Ring-buffer cardinality bound. */
  readonly capacity: number;
  /** Entries currently retained (<= capacity). */
  readonly count: number;
  /** Total entries evicted since construction/reset (oldest-first). */
  readonly dropped: number;
  /** Retained entries, oldest -> newest. */
  readonly entries: ReadonlyArray<DriftHistoryEntry>;
}

export interface DriftHistoryOptions {
  /** Ring-buffer cardinality bound. Defaults to 100. Must be a positive int. */
  readonly capacity?: number;
}

export interface DriftHistory {
  /**
   * Append a snapshot stamped with a caller-supplied time. Pure over its
   * inputs (no clock/RNG). Evicts the oldest entry FIFO when at capacity.
   */
  record(snapshot: DriftSnapshot, at: string): void;
  /** Read the retained timeline (oldest -> newest) + bounding metadata. */
  view(): DriftHistoryView;
  /** Clear all entries and reset `dropped`. `seq` continues monotonically. */
  reset(): void;
}

const DEFAULT_CAPACITY = 100;

/** Derive a per-dimension roll-up from a full snapshot. Pure. */
function toDimensionEntries(
  snapshot: DriftSnapshot,
): DriftHistoryDimensionEntry[] {
  return snapshot.dimensions.map((d) => ({
    dimension: d.dimension,
    tvd: d.tvd,
    alertCount: d.alerts.length,
  }));
}

export function createDriftHistory(
  opts: DriftHistoryOptions = {},
): DriftHistory {
  const rawCapacity = opts.capacity ?? DEFAULT_CAPACITY;
  // A non-positive / non-integer capacity is meaningless for a ring buffer;
  // floor to a usable bound rather than throw (telemetry must not fail closed).
  const capacity =
    Number.isFinite(rawCapacity) && rawCapacity >= 1
      ? Math.floor(rawCapacity)
      : DEFAULT_CAPACITY;

  let entries: DriftHistoryEntry[] = [];
  let dropped = 0;
  // Monotonic across the lifetime of this instance; intentionally NOT reset by
  // reset() so post-reset entries never reuse a pre-reset seq.
  let nextSeq = 0;

  return {
    record(snapshot, at) {
      const dimensions = toDimensionEntries(snapshot);
      const maxTvd = dimensions.reduce((m, d) => Math.max(m, d.tvd), 0);
      const alertCount = dimensions.reduce((s, d) => s + d.alertCount, 0);
      const entry: DriftHistoryEntry = {
        at,
        seq: nextSeq,
        totalObserved: snapshot.totalObserved,
        maxTvd,
        alertCount,
        dimensions,
      };
      nextSeq += 1;
      entries.push(entry);
      while (entries.length > capacity) {
        entries.shift();
        dropped += 1;
      }
    },
    view() {
      return {
        capacity,
        count: entries.length,
        dropped,
        // Defensive copy so callers can't mutate internal state.
        entries: entries.slice(),
      };
    },
    reset() {
      entries = [];
      dropped = 0;
    },
  };
}
