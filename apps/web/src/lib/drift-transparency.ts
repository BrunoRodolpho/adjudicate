/**
 * Public behavioral-drift transparency projection (ADR-132, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. The operator console shows
 * the full statistical-drift detail — per-dimension TVD numbers, the
 * baseline/recent CATEGORY MAPS, the alert list, and a TVD timeline. Most of
 * that aids an attacker probing whether an injected intent kind landed (a
 * `new_category` signal echoing a category VALUE would confirm it), so the
 * public view must publish none of it.
 *
 * `projectDriftTransparency` is therefore an AGGREGATE-ONLY, BANDED projection.
 * It reads only each dimension's TVD + alert count + the threshold, and emits:
 *   (a) a coarse severity BAND (ok / elevated / high) — never a raw TVD number,
 *   (b) the total active-alert COUNT,
 *   (c) the NAME of the single top-drifting dimension (public vocabulary —
 *       `decision.kind` etc.), never a category VALUE.
 * It NEVER reads — and the output type cannot carry — a category map, a raw
 * TVD, a baseline/recent count, an `__overflow__` bucket, or a timeline entry.
 * This is the load-bearing safety property of the public drift status.
 */

import type {
  DriftDimensionName,
  DriftTransparencySample,
} from "./transparency-fixtures";

/** Coarse, banded severity — never a raw TVD number. */
export type DriftSeverityBand = "ok" | "elevated" | "high";

/**
 * The public, sanitized drift-status payload. This is the COMPLETE shape that
 * reaches the public page — an explicit allowlist of aggregates. No category
 * map, raw TVD, baseline/recent count, overflow bucket, or timeline entry ever
 * appears here.
 */
export interface PublicDriftStatus {
  /** Coarse severity band over the worst dimension. */
  readonly severity: DriftSeverityBand;
  /** Total active drift alerts across all dimensions. */
  readonly activeAlerts: number;
  /**
   * NAME of the single top-drifting dimension (by TVD), or null when nothing is
   * drifting. Dimension names are public vocabulary; category VALUES never are.
   */
  readonly topDimension: DriftDimensionName | null;
  /** Caller-supplied freshness stamp (the only wall-clock read, in app code). */
  readonly asOf: string;
}

/** Band a single dimension's TVD relative to the threshold (color-independent). */
function bandFor(tvd: number, threshold: number): DriftSeverityBand {
  if (threshold <= 0) return tvd > 0 ? "high" : "ok";
  const ratio = tvd / threshold;
  if (ratio >= 2) return "high";
  if (ratio >= 1) return "elevated";
  return "ok";
}

const BAND_RANK: Record<DriftSeverityBand, number> = {
  ok: 0,
  elevated: 1,
  high: 2,
};

/**
 * Project an illustrative drift sample into its public, aggregate-only, banded
 * form. Pure and deterministic over `(sample, asOf)`; no clock/RNG/I/O — `asOf`
 * is supplied by the caller so the function itself stays clock-free and testable.
 */
export function projectDriftTransparency(
  sample: DriftTransparencySample,
  asOf: string,
): PublicDriftStatus {
  const { alertThreshold, dimensions } = sample;

  let severity: DriftSeverityBand = "ok";
  let activeAlerts = 0;
  let topDimension: DriftDimensionName | null = null;
  let topTvd = -1;

  for (const d of dimensions) {
    activeAlerts += d.alertCount;
    const band = bandFor(d.tvd, alertThreshold);
    if (BAND_RANK[band] > BAND_RANK[severity]) severity = band;
    // Top dimension = highest TVD that is actually drifting (band > ok). Ties
    // resolve to the first in fixture order for determinism.
    if (band !== "ok" && d.tvd > topTvd) {
      topTvd = d.tvd;
      topDimension = d.dimension;
    }
  }

  return { severity, activeAlerts, topDimension, asOf };
}
