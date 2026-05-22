/**
 * Replay-drift detector — turns a *sequence* of `ReplayReport` samples
 * (e.g., one per day, one per release tag) into a deterministic drift
 * summary so operators can answer "is replay quality regressing?"
 * without re-running every report by hand.
 *
 * Pure, additive primitive. No clock, no I/O, no RNG. Callers feed in
 * timestamped reports they already have; this module slices, diffs, and
 * classifies. The output is a JSON-stable value.
 *
 * Why this lives in `@adjudicate/audit` and not `@adjudicate/admin-sdk`:
 *   - The SDK is the *transport* (Zod schemas, tRPC procedures).
 *   - This is a *pure analytic primitive* that operates on the same
 *     `ReplayReport` shape `replay()` produces.
 *
 * Closed vocabulary:
 *   `stable | improving | regressing | flapping | insufficient_data`
 *
 * Threshold defaults are intentionally conservative — adopters running
 * tighter SLOs override them. Defaults documented in
 * `DEFAULT_DRIFT_THRESHOLDS`.
 */

import type { ReplayReport } from "./replay.js";

export type ReplayDriftClass =
  | "stable"
  | "improving"
  | "regressing"
  | "flapping"
  | "insufficient_data";

export interface ReplayDriftSample {
  /** Caller-supplied label (e.g., ISO date, release tag, commit sha). */
  readonly label: string;
  readonly report: ReplayReport;
}

export interface ReplayDriftThresholds {
  /**
   * Minimum mismatches-per-record rate that counts as "regressing"
   * between adjacent samples. Default `0.01` (1% record-level drift).
   */
  readonly regressionRateDelta: number;
  /**
   * Minimum samples required before any classification is meaningful.
   * Default `3`.
   */
  readonly minSamples: number;
  /**
   * Maximum direction-flips allowed before the series is classified as
   * `flapping`. Default `2` over the windowed series.
   */
  readonly maxFlips: number;
}

export const DEFAULT_DRIFT_THRESHOLDS: ReplayDriftThresholds = {
  regressionRateDelta: 0.01,
  minSamples: 3,
  maxFlips: 2,
};

export interface ReplayDriftPoint {
  readonly label: string;
  readonly total: number;
  readonly matched: number;
  readonly mismatches: number;
  /** mismatches / total; `0` when total is `0`. */
  readonly mismatchRate: number;
}

export interface ReplayDriftReport {
  readonly schemaVersion: 1;
  readonly classification: ReplayDriftClass;
  readonly points: ReadonlyArray<ReplayDriftPoint>;
  /**
   * Per-sample delta from the previous sample's mismatchRate. Aligned to
   * `points`; the first entry is always `0`.
   */
  readonly deltas: ReadonlyArray<number>;
  /** Count of monotonic direction flips across the deltas series. */
  readonly directionFlips: number;
  /**
   * Total mismatch growth across the series: `last.mismatchRate -
   * first.mismatchRate`. Positive = regression, negative = improvement.
   */
  readonly netDelta: number;
  /**
   * Operator-readable headline. Stable across the same input sequence.
   */
  readonly headline: string;
}

/**
 * Classify a series of `ReplayReport` samples into a drift trend.
 *
 * Inputs are *taken in order*. The caller is responsible for supplying
 * them sorted chronologically (or in whatever ordering they want
 * compared). The function does not sort the samples — that would lose
 * the caller's intent (release-tag ordering ≠ chronological ordering).
 */
export function classifyReplayDrift(
  samples: ReadonlyArray<ReplayDriftSample>,
  thresholds: Partial<ReplayDriftThresholds> = {},
): ReplayDriftReport {
  const t: ReplayDriftThresholds = { ...DEFAULT_DRIFT_THRESHOLDS, ...thresholds };
  const points: ReplayDriftPoint[] = samples.map((s) => {
    const total = s.report.total;
    const matched = s.report.matched;
    const mismatches = s.report.mismatches.length;
    const mismatchRate = total === 0 ? 0 : mismatches / total;
    return { label: s.label, total, matched, mismatches, mismatchRate };
  });

  if (points.length < t.minSamples) {
    return {
      schemaVersion: 1,
      classification: "insufficient_data",
      points,
      deltas: points.map(() => 0),
      directionFlips: 0,
      netDelta: 0,
      headline: `insufficient_data: ${points.length} sample${points.length === 1 ? "" : "s"} supplied (need ≥${t.minSamples})`,
    };
  }

  const deltas: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    deltas.push(points[i]!.mismatchRate - points[i - 1]!.mismatchRate);
  }

  let flips = 0;
  let prevSign = 0;
  for (let i = 1; i < deltas.length; i++) {
    const sign = Math.sign(deltas[i]!);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips++;
    if (sign !== 0) prevSign = sign;
  }

  const netDelta = points[points.length - 1]!.mismatchRate - points[0]!.mismatchRate;

  let classification: ReplayDriftClass;
  if (flips > t.maxFlips) {
    classification = "flapping";
  } else if (netDelta >= t.regressionRateDelta) {
    classification = "regressing";
  } else if (netDelta <= -t.regressionRateDelta) {
    classification = "improving";
  } else {
    classification = "stable";
  }

  const headline = buildHeadline(classification, points, netDelta, flips);

  return {
    schemaVersion: 1,
    classification,
    points,
    deltas,
    directionFlips: flips,
    netDelta,
    headline,
  };
}

function buildHeadline(
  classification: ReplayDriftClass,
  points: ReadonlyArray<ReplayDriftPoint>,
  netDelta: number,
  flips: number,
): string {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const range = `${first.label} → ${last.label}`;
  switch (classification) {
    case "stable":
      return `replay drift: stable across ${points.length} samples (${range}); mismatch rate ≈ ${pct(last.mismatchRate)}`;
    case "improving":
      return `replay drift: improving across ${points.length} samples (${range}); net Δ ${pct(netDelta)}`;
    case "regressing":
      return `replay drift: regressing across ${points.length} samples (${range}); net Δ +${pct(netDelta)}`;
    case "flapping":
      return `replay drift: flapping across ${points.length} samples (${range}); ${flips} direction flips`;
    case "insufficient_data":
      return `replay drift: insufficient data`;
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
