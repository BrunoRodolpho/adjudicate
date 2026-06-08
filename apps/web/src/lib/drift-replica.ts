/**
 * drift-replica — ILLUSTRATIVE operator-detail data for the behavioral-drift
 * replica under /console/drift (ADR-132).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It exists ONLY to drive the clearly-labeled
 * "Illustrative replica of the operator console" surface, rendered inside the
 * ConsoleChrome honesty boundary. apps/web is a public, unauthenticated
 * marketing surface with NO database/redis/admin credentials — it never reads a
 * live `governance.behavioralDrift` snapshot or `governance.driftHistory`
 * series. These literals stand in for what those would return.
 *
 * SYNTHETIC + STATIC: every value below is a FIXED literal. There is no
 * wall-clock (`Date.now()` / `new Date()`) and no random source anywhere in
 * this module, so the replica renders identically across builds, machines, and
 * SSR/CSR.
 *
 * The PUBLIC transparency projection (`drift-transparency.ts`) carries only a
 * banded severity + the top-drifting dimension NAME. The operator console,
 * however, shows the full per-dimension detail: the active-drift alert list
 * (signal type + magnitude + baseline→recent COUNTS) and a max-TVD timeline.
 * Those operator-detail aggregates are what THIS fixture supplies, so the
 * replica can mirror the real `/drift` screen instead of only the public badge.
 *
 * SAFETY: per the public-drift redaction note, a category VALUE (e.g. the
 * specific `decision.kind` bucket that drifted) would help an attacker confirm
 * an injected intent landed. This fixture therefore carries only closed
 * dimension NAMES (public vocabulary) + the closed signal-type enum +
 * aggregate COUNTS. It carries NO category value, NO baseline/recent category
 * map, and NO raw audit payload — there is no field that could.
 */

import type { DriftDimensionName } from "./transparency-fixtures";

/**
 * Closed-enum drift signal type — byte-equal to the operator console's
 * `SIGNAL_LABEL` keys (apps/console drift page). The signal type is a generic
 * classification of HOW a dimension drifted, never a category value.
 */
export type DriftSignalType =
  | "distribution_shift"
  | "new_category"
  | "proportion_spike";

/**
 * One ILLUSTRATIVE active-drift alert for the replica's active-drifts table.
 * Mirrors the operator console's flattened alert row (dimension, signal,
 * magnitude vs threshold, baseline→recent counts) — aggregate counts only, no
 * category value.
 */
export interface ReplicaDriftAlert {
  /** Closed-enum dimension NAME (public vocabulary). */
  readonly dimension: DriftDimensionName;
  /** Closed-enum signal type — how the dimension drifted. */
  readonly signal: DriftSignalType;
  /** Observed TVD/proportion magnitude for this alert. */
  readonly magnitude: number;
  /** Alert threshold the magnitude is measured against. */
  readonly threshold: number;
  /** Baseline-window observation count for the drifting dimension. */
  readonly baselineCount: number;
  /** Recent-window observation count for the drifting dimension. */
  readonly recentCount: number;
}

/**
 * One ILLUSTRATIVE per-dimension roll-up for the replica's TVD summary table:
 * the dimension's current TVD + its active-alert count. Aggregate only.
 */
export interface ReplicaDriftDimension {
  readonly dimension: DriftDimensionName;
  readonly tvd: number;
  readonly alertCount: number;
}

/** One ILLUSTRATIVE max-TVD timeline point — a fixed snapshot time + max TVD. */
export interface ReplicaDriftTimelinePoint {
  /** Fixed ISO snapshot time (a literal — never a wall-clock read). */
  readonly at: string;
  /** The max TVD across all tracked dimensions at this snapshot. */
  readonly maxTvd: number;
}

/**
 * The full operator-detail drift fixture for the replica. `alertThreshold`,
 * `baselineWindow`, and `recentWindow` mirror the console's snapshot metadata
 * (rendered in the dimensions sub-header). All counts are aggregate; no
 * category value or map appears anywhere.
 */
export interface DriftReplicaFixture {
  readonly alertThreshold: number;
  readonly baselineWindow: number;
  readonly recentWindow: number;
  readonly totalObserved: number;
  readonly dimensions: readonly ReplicaDriftDimension[];
  readonly alerts: readonly ReplicaDriftAlert[];
  readonly timeline: readonly ReplicaDriftTimelinePoint[];
}

/**
 * Illustrative drift snapshot for the reference deployment. Mirrors the public
 * `DRIFT_TRANSPARENCY_SAMPLE` posture (one mildly-elevated dimension —
 * `decision.kind` at TVD 0.31 over a 0.25 threshold; everything else within
 * threshold) but expands it with the operator-detail the console shows: the
 * active alert's signal type + baseline→recent counts and a 12-snapshot max-TVD
 * timeline that climbs into the elevated band and is plateauing (the healthy
 * "watch it" posture, not a crisis). Counts only; no category values.
 *
 * The dimensions/threshold here are kept consistent with the public fixture so
 * the two surfaces tell the same story.
 */
export const DRIFT_REPLICA: DriftReplicaFixture = {
  alertThreshold: 0.25,
  baselineWindow: 500,
  recentWindow: 200,
  totalObserved: 4820,
  dimensions: [
    { dimension: "decision.kind", tvd: 0.31, alertCount: 1 },
    { dimension: "intent.kind", tvd: 0.12, alertCount: 0 },
    { dimension: "basis", tvd: 0.04, alertCount: 0 },
  ],
  alerts: [
    {
      dimension: "decision.kind",
      signal: "distribution_shift",
      magnitude: 0.31,
      threshold: 0.25,
      baselineCount: 500,
      recentCount: 200,
    },
  ],
  // 12 fixed snapshots, ascending by time. Max TVD rises from within-threshold
  // into the elevated band and plateaus around 0.31 — legible as "new, now
  // sustained" without ever crossing into the high (>=2× threshold) band.
  timeline: [
    { at: "2026-05-13T00:00:00.000Z", maxTvd: 0.08 },
    { at: "2026-05-13T02:00:00.000Z", maxTvd: 0.09 },
    { at: "2026-05-13T04:00:00.000Z", maxTvd: 0.11 },
    { at: "2026-05-13T06:00:00.000Z", maxTvd: 0.14 },
    { at: "2026-05-13T08:00:00.000Z", maxTvd: 0.18 },
    { at: "2026-05-13T10:00:00.000Z", maxTvd: 0.22 },
    { at: "2026-05-13T12:00:00.000Z", maxTvd: 0.27 },
    { at: "2026-05-13T14:00:00.000Z", maxTvd: 0.3 },
    { at: "2026-05-13T16:00:00.000Z", maxTvd: 0.32 },
    { at: "2026-05-13T18:00:00.000Z", maxTvd: 0.31 },
    { at: "2026-05-13T20:00:00.000Z", maxTvd: 0.31 },
    { at: "2026-05-13T22:00:00.000Z", maxTvd: 0.31 },
  ],
};

/** Public dimension labels for the replica (closed set, mirrors the console). */
export const DRIFT_DIMENSION_LABEL: Record<DriftDimensionName, string> = {
  "decision.kind": "decision.kind",
  "intent.kind": "intent.kind",
  basis: "basis",
};

/** Signal-type labels — mirrors the operator console's `SIGNAL_LABEL`. */
export const DRIFT_SIGNAL_LABEL: Record<DriftSignalType, string> = {
  distribution_shift: "Distribution shift",
  new_category: "New category",
  proportion_spike: "Proportion spike",
};

/** Coarse severity band — color-independent, mirrors the console's `severityBand`. */
export type DriftSeverityBand = "ok" | "elevated" | "high";

/** Band a magnitude relative to its threshold. Pure; mirrors the console. */
export function driftSeverityBand(
  magnitude: number,
  threshold: number,
): DriftSeverityBand {
  if (threshold <= 0) return magnitude > 0 ? "high" : "ok";
  const ratio = magnitude / threshold;
  if (ratio >= 2) return "high";
  if (ratio >= 1) return "elevated";
  return "ok";
}
