"use client";

import { EmptyFigure, SrOnlyTable } from "./BarDistribution";
import {
  formatCount,
  SERIES_PALETTE,
  type NamedSeries,
} from "./types";
import { cn } from "@/lib/cn";

/**
 * Multi-series stacked area chart over time — outcome distribution by decision
 * kind, or any breakdown that sums to a meaningful total.
 *
 * Stacking is deterministic: the union of all time keys is collected in
 * first-seen order, each series is densified onto that axis (missing samples
 * count as 0), and layers are stacked bottom-up in the order the series are
 * passed. Colors fall back to a stable palette indexed by series position. The
 * SVG uses a fixed viewBox at 100% width — no measurement, jsdom-safe.
 *
 * a11y: decorative aria-hidden <svg> + a visually-hidden data <table> whose
 * columns are (Time, ...series), wrapped in a labelled <figure role="group">.
 */
export interface StackedAreaChartProps {
  readonly series: readonly NamedSeries[];
  readonly title: string;
  readonly className?: string;
  /** Value formatter for the data table. Defaults to locale count. */
  readonly yFormat?: (n: number) => string;
}

const VIEW_W = 300;
const VIEW_H = 120;
const PAD = 4;

export function StackedAreaChart({
  series,
  title,
  className,
  yFormat = formatCount,
}: StackedAreaChartProps) {
  // Collect the time axis in first-seen order across all series.
  const axis: string[] = [];
  const seen = new Set<string>();
  for (const s of series) {
    for (const p of s.points) {
      if (!seen.has(p.t)) {
        seen.add(p.t);
        axis.push(p.t);
      }
    }
  }

  const hasData = series.length > 0 && axis.length > 0;
  if (!hasData) {
    return (
      <EmptyFigure title={title} className={className} message="No data to chart." />
    );
  }

  // Densify each series onto the shared axis (missing → 0, negatives → 0).
  const valueByKeyTime = series.map((s) => {
    const map = new Map<string, number>();
    for (const p of s.points) map.set(p.t, Math.max(0, p.value));
    return axis.map((t) => map.get(t) ?? 0);
  });

  // Per-time stacked totals → scale ceiling (floored at 1).
  const totals = axis.map((_t, i) =>
    valueByKeyTime.reduce((sum, vals) => sum + vals[i]!, 0),
  );
  const scaleMax = Math.max(1, ...totals);

  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;
  const baseline = PAD + innerH;

  const xOf = (i: number) =>
    axis.length === 1
      ? PAD + innerW / 2
      : PAD + (i / (axis.length - 1)) * innerW;
  const yOf = (cumulative: number) =>
    PAD + innerH - (cumulative / scaleMax) * innerH;

  // Build stacked-area polygons bottom-up. `lower[i]` accumulates the running
  // sum below the current layer at time i.
  const lower = axis.map(() => 0);
  const layers = series.map((s, k) => {
    const vals = valueByKeyTime[k]!;
    const upper = axis.map((_t, i) => lower[i]! + vals[i]!);

    const color = s.color ?? SERIES_PALETTE[k % SERIES_PALETTE.length]!;

    let path: string;
    if (axis.length === 1) {
      // One time key: draw a thin column so a single bucket is still visible.
      const x = xOf(0);
      const halfW = Math.min(6, innerW / 2);
      path = `M ${round(x - halfW)} ${round(yOf(lower[0]!))} L ${round(
        x - halfW,
      )} ${round(yOf(upper[0]!))} L ${round(x + halfW)} ${round(
        yOf(upper[0]!),
      )} L ${round(x + halfW)} ${round(yOf(lower[0]!))} Z`;
    } else {
      const top = axis
        .map(
          (_t, i) =>
            `${i === 0 ? "M" : "L"} ${round(xOf(i))} ${round(yOf(upper[i]!))}`,
        )
        .join(" ");
      const bottom = axis
        .map((_t, i) => {
          const idx = axis.length - 1 - i;
          return `L ${round(xOf(idx))} ${round(yOf(lower[idx]!))}`;
        })
        .join(" ");
      path = `${top} ${bottom} Z`;
    }

    // Advance the running base for the next layer.
    for (let i = 0; i < lower.length; i++) lower[i] = upper[i]!;

    return { key: s.key, color, path };
  });

  return (
    <figure
      role="group"
      aria-label={title}
      className={cn("flex flex-col gap-1", className)}
    >
      <figcaption className="text-[10px] uppercase tracking-section text-faint">
        {title}
      </figcaption>

      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: VIEW_H }}
      >
        <line
          x1={PAD}
          x2={VIEW_W - PAD}
          y1={baseline}
          y2={baseline}
          stroke="rgb(39 39 42)"
          strokeWidth={0.5}
        />
        {layers.map((l) => (
          <path
            key={l.key}
            d={l.path}
            fill={l.color}
            fillOpacity={0.45}
            stroke={l.color}
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Visible legend. */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {layers.map((l) => (
          <li
            key={l.key}
            className="flex items-center gap-1 text-[10px] uppercase tracking-section text-faint"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: l.color }}
            />
            <span className="text-muted">{l.key}</span>
          </li>
        ))}
      </ul>

      <SrOnlyTable
        title={title}
        head={["Time", ...series.map((s) => s.key)]}
        rows={axis.map((t, i) => [
          t,
          ...valueByKeyTime.map((vals) => yFormat(vals[i]!)),
        ])}
      />
    </figure>
  );
}

/** Round to 2dp so generated path strings are stable and compact. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
