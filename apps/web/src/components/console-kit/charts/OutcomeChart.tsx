import type { DecisionKind } from "@adjudicate/core";
import {
  DECISION_KIND_ORDER,
  decisionTheme,
} from "../decision-theme";

export interface OutcomeBucket {
  at: string;
  EXECUTE: number;
  REFUSE: number;
  REWRITE: number;
  DEFER: number;
  ESCALATE: number;
  REQUEST_CONFIRMATION: number;
}

/**
 * Stacked area chart of Decision counts over time. Hand-rolled SVG —
 * matches the console's monospace/data-density aesthetic and keeps the
 * bundle free of a charting library.
 *
 * Buckets are pre-sorted ascending by the caller. `width`/`height` are
 * the SVG canvas dimensions; layout sizes are responsive within them.
 *
 * Ported from apps/console (ADR-128: copy, don't share). Token classes were
 * renamed to the console.* dark namespace (border-edge → border-console-edge,
 * fill-faint → fill-console-faint, etc.); hardcoded RGB stack fills/strokes are
 * unchanged — they already read correctly on dark.
 */
export function OutcomeChart({
  buckets,
  width = 720,
  height = 240,
}: {
  buckets: readonly OutcomeBucket[];
  width?: number;
  height?: number;
}) {
  if (buckets.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-console-edge bg-console-panel/40 text-[11px] text-console-muted"
        style={{ height }}
      >
        No decisions in the selected window.
      </div>
    );
  }

  const pad = { top: 10, right: 12, bottom: 22, left: 32 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const totals = buckets.map((b) =>
    DECISION_KIND_ORDER.reduce((s, k) => s + b[k], 0),
  );
  const maxTotal = Math.max(1, ...totals);

  // X positions — even spacing across buckets.
  const xOf = (i: number) =>
    buckets.length === 1
      ? pad.left + w / 2
      : pad.left + (i / (buckets.length - 1)) * w;

  // Build stacked-area polygons for each Decision kind.
  const layers = DECISION_KIND_ORDER.map((kind, kIdx) => {
    const upper = buckets.map((_b, i) =>
      DECISION_KIND_ORDER.slice(0, kIdx + 1).reduce(
        (s, k) => s + buckets[i]![k],
        0,
      ),
    );
    const lower = buckets.map((_b, i) =>
      DECISION_KIND_ORDER.slice(0, kIdx).reduce(
        (s, k) => s + buckets[i]![k],
        0,
      ),
    );
    const top = buckets.map(
      (_b, i) => pad.top + h - (upper[i]! / maxTotal) * h,
    );
    const bottom = buckets.map(
      (_b, i) => pad.top + h - (lower[i]! / maxTotal) * h,
    );
    const pathTop = buckets
      .map((_b, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${top[i]}`)
      .join(" ");
    const pathBottom = buckets
      .map((_b, i) => `L ${xOf(buckets.length - 1 - i)} ${bottom[buckets.length - 1 - i]}`)
      .join(" ");
    return { kind, path: `${pathTop} ${pathBottom} Z` };
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: pad.top + h - f * h,
    label: Math.round(f * maxTotal).toString(),
  }));

  const xLabelStride = Math.max(1, Math.floor(buckets.length / 6));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Decision outcome distribution"
      className="w-full"
    >
      {/* axes grid */}
      {yTicks.map((t) => (
        <g key={t.y}>
          <line
            x1={pad.left}
            x2={pad.left + w}
            y1={t.y}
            y2={t.y}
            stroke="rgb(39 39 42)"
            strokeWidth={0.5}
          />
          <text
            x={pad.left - 4}
            y={t.y}
            textAnchor="end"
            alignmentBaseline="middle"
            className="fill-console-faint"
            style={{ fontSize: 9, fontFamily: "JetBrains Mono, ui-monospace" }}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* stacked area layers */}
      {layers.map((l) => {
        const fill = STACK_FILL[l.kind];
        const stroke = STACK_STROKE[l.kind];
        return (
          <path
            key={l.kind}
            d={l.path}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.75}
          />
        );
      })}

      {/* x-axis tick labels */}
      {buckets.map((b, i) =>
        i % xLabelStride === 0 ? (
          <text
            key={b.at + i}
            x={xOf(i)}
            y={height - 6}
            textAnchor="middle"
            className="fill-console-faint"
            style={{ fontSize: 9, fontFamily: "JetBrains Mono, ui-monospace" }}
          >
            {shortAxis(b.at)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const STACK_FILL: Record<DecisionKind, string> = {
  EXECUTE: "rgba(52 211 153 / 0.45)",
  REFUSE: "rgba(248 113 113 / 0.45)",
  DEFER: "rgba(251 191 36 / 0.45)",
  ESCALATE: "rgba(167 139 250 / 0.45)",
  REQUEST_CONFIRMATION: "rgba(56 189 248 / 0.45)",
  REWRITE: "rgba(251 146 60 / 0.45)",
};
const STACK_STROKE: Record<DecisionKind, string> = {
  EXECUTE: "rgb(52 211 153)",
  REFUSE: "rgb(248 113 113)",
  DEFER: "rgb(251 191 36)",
  ESCALATE: "rgb(167 139 250)",
  REQUEST_CONFIRMATION: "rgb(56 189 248)",
  REWRITE: "rgb(251 146 60)",
};

function shortAxis(iso: string): string {
  // "2026-05-13T12:00:00.000Z" → "05-13 12h" or "05-13"
  return iso.length >= 13 ? `${iso.slice(5, 10)} ${iso.slice(11, 13)}h` : iso.slice(0, 10);
}

/** Compact legend showing each Decision kind with its stack color. */
export function OutcomeChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-section text-console-muted">
      {DECISION_KIND_ORDER.map((kind) => {
        const t = decisionTheme[kind];
        return (
          <span key={kind} className="flex items-center gap-1">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${t.dot}`}
            />
            <span className={t.fg}>{t.label}</span>
          </span>
        );
      })}
    </div>
  );
}
