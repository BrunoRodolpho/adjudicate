/**
 * Public transparency data contract (ADR-128, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. Unlike the operator console
 * it must never expose raw governance data. Every public transparency route is
 * built by projecting an admin/governance result through an explicit allowlist
 * down to AGGREGATES ONLY:
 *
 *   - allowed: counts, ratios, closed-enum category/severity labels, coarse
 *     time buckets, pack ids + versions, BOM hashes (hashes, not contents).
 *   - forbidden: raw PII/field values, command text, prompt contents, token
 *     counts, session/tenant ids, intent hashes, actor identities, free-text
 *     reasons, individual audit records.
 *
 * In addition, small counts are floored (`< COHORT_FLOOR`) so a low-volume
 * deployment cannot be de-anonymized by reading an exact "1 PII block" off a
 * public page. The projection is allowlist-based by construction (you build the
 * public shape field-by-field), and this module supplies the count-censoring
 * primitives that every public route shares.
 */

/** Counts strictly below this (and above zero) are shown as "<N", never exact. */
export const PUBLIC_COHORT_FLOOR = 5;

/** True when an exact count would be suppressed by the small-cohort floor. */
export function isCensored(n: number, floor: number = PUBLIC_COHORT_FLOOR): boolean {
  return Number.isFinite(n) && n > 0 && n < floor;
}

/**
 * Render a count for a public view: `"0"`, `"<5"` for small non-zero cohorts,
 * or the exact integer otherwise. Non-finite / negative inputs render `"0"`
 * (fail-safe — a public view never shows a misleading or NaN figure).
 */
export function publicCountLabel(
  n: number,
  floor: number = PUBLIC_COHORT_FLOOR,
): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < floor) return `<${floor}`;
  return String(Math.floor(n));
}

/**
 * Clamp a count to a chart-safe number under the cohort floor: small non-zero
 * cohorts are lifted to the floor so a bar/point cannot reveal the exact small
 * value while still rendering a non-empty mark. Use {@link publicCountLabel}
 * for the textual/sr-only value.
 */
export function clampCohort(
  n: number,
  floor: number = PUBLIC_COHORT_FLOOR,
): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < floor) return floor;
  return Math.floor(n);
}

/** A public aggregate bucket — a closed-enum label plus a (censored) count. */
export interface PublicBucket {
  readonly label: string;
  /** Exact count when ≥ floor; otherwise the floor value (use `censored`). */
  readonly value: number;
  /** True when `value` is floored rather than exact. */
  readonly censored: boolean;
  /** Display string: "0" | "<5" | "N". */
  readonly display: string;
}

/**
 * Project an array of `{ label, count }` aggregates into public buckets,
 * applying the small-cohort floor. The label MUST already be a safe closed-enum
 * value (the caller's allowlist guarantees this) — this helper does not inspect
 * or sanitize labels, only censors counts.
 */
export function toPublicBuckets(
  rows: ReadonlyArray<{ label: string; count: number }>,
  floor: number = PUBLIC_COHORT_FLOOR,
): PublicBucket[] {
  return rows.map((r) => ({
    label: r.label,
    value: clampCohort(r.count, floor),
    censored: isCensored(r.count, floor),
    display: publicCountLabel(r.count, floor),
  }));
}
