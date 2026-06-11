import { EmptyFigure, SrOnlyTable } from "./BarDistribution";
import {
  BAND_COLORS,
  formatCount,
  type Band,
  type TimePoint,
} from "./types";
import { cn } from "@/lib/cn";

/**
 * Single-series line/area chart over time — drift timelines, token burn-down,
 * red-team trend.
 *
 * The path is computed deterministically over the props (no measurement, no
 * clock): points map onto a fixed 0..VIEW_W × 0..VIEW_H viewBox, the SVG is
 * 100%-width so it scales with its container. Edge cases:
 *   - 0 points  → empty-state figure.
 *   - 1 point   → a centered dot + flat baseline (a single point has no line).
 *   - all-zero  → flat line along the baseline (max floored at 1).
 *
 * a11y: decorative aria-hidden <svg> + visually-hidden data <table>, wrapped in
 * a labelled <figure role="group">.
 *
 * Ported from apps/console (ADR-128: copy, don't share). Token classes were
 * renamed to the console.* dark namespace; hardcoded RGB chart colors are
 * unchanged — they already read correctly on dark.
 */
export interface TimelineChartProps {
  readonly points: readonly TimePoint[];
  readonly title: string;
  readonly className?: string;
  /** Value formatter for the data table. Defaults to locale count. */
  readonly yFormat?: (n: number) => string;
  /** Severity band; tints the stroke/fill. Defaults to "ok" (emerald). */
  readonly band?: Band;
}

const VIEW_W = 300;
const VIEW_H = 80;
const PAD = 4;

export function TimelineChart({
  points,
  title,
  className,
  yFormat = formatCount,
  band = "ok",
}: TimelineChartProps) {
  if (points.length === 0) {
    return (
      <EmptyFigure title={title} className={className} message="No data to chart." />
    );
  }

  const { stroke, fill } = BAND_COLORS[band];

  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;

  // Scale: clamp negatives to 0, floor the ceiling at 1 to avoid /0.
  const maxV = points.reduce((m, p) => Math.max(m, p.value), 0);
  const scaleMax = Math.max(1, maxV);

  // X position: single point sits centered; otherwise even spacing.
  const xOf = (i: number) =>
    points.length === 1
      ? PAD + innerW / 2
      : PAD + (i / (points.length - 1)) * innerW;

  // Y: invert (SVG y grows downward); baseline is the bottom edge.
  const yOf = (v: number) =>
    PAD + innerH - (Math.max(0, v) / scaleMax) * innerH;

  const coords = points.map((p, i) => ({ x: xOf(i), y: yOf(p.value) }));

  // Polyline path. With a single point there is no line segment, so we render
  // a dot instead (handled below).
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${round(c.x)} ${round(c.y)}`)
    .join(" ");

  const baseline = PAD + innerH;
  // Closed area path: line, then down to baseline and back to the start x.
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${round(coords[coords.length - 1]!.x)} ${round(
          baseline,
        )} L ${round(coords[0]!.x)} ${round(baseline)} Z`
      : null;

  return (
    <figure
      role="group"
      aria-label={title}
      className={cn("flex flex-col gap-1", className)}
    >
      <figcaption className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-section text-console-muted">
        <span>{title}</span>
        <span className="shrink-0 normal-case tabular-nums text-console-faint">
          peak {yFormat(scaleMax)}
        </span>
      </figcaption>

      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: VIEW_H }}
      >
        {/* horizontal gridlines (¼ ½ ¾) — give the plot structure */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={VIEW_W - PAD}
            y1={PAD + innerH * f}
            y2={PAD + innerH * f}
            stroke="rgb(39 39 42)"
            strokeWidth={0.5}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* baseline */}
        <line
          x1={PAD}
          x2={VIEW_W - PAD}
          y1={baseline}
          y2={baseline}
          stroke="rgb(63 63 70)"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
        />
        {areaPath ? (
          <path d={areaPath} fill={fill} stroke="none" />
        ) : null}
        {coords.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <circle
            cx={round(coords[0]!.x)}
            cy={round(coords[0]!.y)}
            r={2}
            fill={stroke}
          />
        )}
      </svg>

      <SrOnlyTable
        title={title}
        head={["Time", "Value"]}
        rows={points.map((p) => [p.t, yFormat(p.value)])}
      />
    </figure>
  );
}

/** Round to 2dp so generated path strings are stable and compact. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
