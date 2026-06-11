/**
 * Shared types for the bespoke, zero-dependency SVG chart kit.
 *
 * Every chart in this kit is PURE: deterministic over its props, with no
 * clock/RNG access in the render path and stable element ordering. That keeps
 * them safe to snapshot, trivial to test in jsdom, and free of hydration
 * mismatches in the App Router.
 *
 * Ported verbatim from apps/console (ADR-128: copy, don't share). No token
 * rename needed — this module carries only types and hardcoded RGB palettes,
 * which read correctly on the dark console surface.
 */

/** A single labelled category datum — the unit of {@link "./BarDistribution"}. */
export interface SeriesPoint {
  /** Category label (rendered verbatim; the caller owns formatting). */
  readonly label: string;
  /** Magnitude. May be 0; negative values are clamped to 0 when scaled. */
  readonly value: number;
}

/** A single (time, value) sample — the unit of the time-based charts. */
export interface TimePoint {
  /** Time key. Treated as an opaque, pre-sorted string (e.g. ISO-8601). */
  readonly t: string;
  /** Value at time `t`. May be 0; negative values clamp to 0 when scaled. */
  readonly value: number;
}

/** One named series of {@link TimePoint}s — the unit of stacked-area charts. */
export interface NamedSeries {
  /** Stable series identifier; also the default visible name. */
  readonly key: string;
  /** Optional explicit stroke/fill base color (any CSS color string). */
  readonly color?: string;
  /** Samples, expected pre-sorted ascending by `t`. */
  readonly points: readonly TimePoint[];
}

/**
 * Severity band used to tint a {@link "./TimelineChart"}. Composed from the
 * existing decision/state color tokens — no new tokens are introduced.
 */
export type Band = "ok" | "warn" | "crit";

/** Resolved stroke/fill pair for a {@link Band}. */
export interface BandColor {
  readonly stroke: string;
  readonly fill: string;
}

/**
 * Band → color mapping. Mirrors the palette already used by OutcomeChart
 * (emerald = ok/execute, amber = warn/defer, red = crit/refuse).
 */
export const BAND_COLORS: Record<Band, BandColor> = {
  ok: { stroke: "rgb(52 211 153)", fill: "rgb(52 211 153 / 0.18)" },
  warn: { stroke: "rgb(251 191 36)", fill: "rgb(251 191 36 / 0.18)" },
  crit: { stroke: "rgb(248 113 113)", fill: "rgb(248 113 113 / 0.18)" },
};

/**
 * Deterministic fallback palette for stacked-area series that don't supply an
 * explicit color. Indexed modulo length so output is stable for a given input.
 * Drawn from the OutcomeChart stack palette for visual consistency.
 */
export const SERIES_PALETTE: readonly string[] = [
  "rgb(52 211 153)", // emerald
  "rgb(56 189 248)", // sky
  "rgb(167 139 250)", // violet
  "rgb(251 191 36)", // amber
  "rgb(251 146 60)", // orange
  "rgb(248 113 113)", // red
];

/** Default numeric formatter — locale thousands separators, no decimals. */
export const formatCount = (n: number): string => n.toLocaleString();
