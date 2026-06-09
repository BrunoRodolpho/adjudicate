import { formatCount, type SeriesPoint } from "./types";
import { cn } from "@/lib/cn";

/**
 * Horizontal bar chart for category counts — command-risk distribution,
 * outcome tallies, anything keyed by a discrete label.
 *
 * Bars are pure CSS-width rectangles inside a 100%-width SVG viewBox, so the
 * chart scales with its container without any measurement (deterministic in
 * jsdom). Bars are scaled to `max` when provided, else to the data max
 * (floored at 1 to avoid divide-by-zero). Negative values clamp to 0.
 *
 * a11y: the <svg> is decorative (aria-hidden) and the same data is mirrored in
 * a visually-hidden <table> with a <caption>, so assistive tech gets a real
 * text alternative. The whole thing is a labelled <figure role="group">.
 *
 * Ported from apps/console (ADR-128: copy, don't share). Token classes were
 * renamed to the console.* dark namespace (text-faint → text-console-faint,
 * etc.) so the kit renders correctly on apps/web's dark surfaces; hardcoded RGB
 * chart fills are left unchanged — they already read correctly on dark.
 */
export interface BarDistributionProps {
  readonly data: readonly SeriesPoint[];
  readonly title: string;
  /** Value formatter for displayed numbers. Defaults to locale count. */
  readonly valueFormat?: (n: number) => string;
  /** Explicit scale ceiling. Defaults to the largest value in `data`. */
  readonly max?: number;
  /**
   * Optional: the `label` of the datum to emphasise. The matching bar group and
   * legend row get a `data-active` attribute so callers can style emphasis (e.g.
   * dim the rest) via CSS without forking the chart. Purely additive — when
   * unset, output is unchanged. Deterministic (no clock/RNG).
   */
  readonly activeLabel?: string;
  readonly className?: string;
}

const ROW_HEIGHT = 22;
const BAR_HEIGHT = 12;
const PAD_X = 2;

export function BarDistribution({
  data,
  title,
  valueFormat = formatCount,
  max,
  activeLabel,
  className,
}: BarDistributionProps) {
  if (data.length === 0) {
    return (
      <EmptyFigure title={title} className={className} message="No data to chart." />
    );
  }

  // Scale ceiling: explicit `max`, else data max, never below 1.
  const dataMax = data.reduce((m, d) => Math.max(m, d.value), 0);
  const scaleMax = Math.max(1, max ?? dataMax);

  const height = data.length * ROW_HEIGHT;
  const barTopOffset = (ROW_HEIGHT - BAR_HEIGHT) / 2;

  return (
    <figure
      role="group"
      aria-label={title}
      className={cn("flex flex-col gap-1", className)}
    >
      <figcaption className="text-[10px] uppercase tracking-section text-console-faint">
        {title}
      </figcaption>

      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        {data.map((d, i) => {
          const clamped = Math.max(0, d.value);
          // Width in viewBox units (0..100), reserving PAD_X on each side.
          const inner = 100 - PAD_X * 2;
          const w = (clamped / scaleMax) * inner;
          const y = i * ROW_HEIGHT + barTopOffset;
          return (
            <g
              key={`${d.label}-${i}`}
              data-active={
                activeLabel !== undefined && d.label === activeLabel
                  ? "true"
                  : undefined
              }
            >
              {/* track */}
              <rect
                x={PAD_X}
                y={y}
                width={inner}
                height={BAR_HEIGHT}
                rx={1}
                fill="rgb(39 39 42 / 0.6)"
              />
              {/* value bar */}
              <rect
                x={PAD_X}
                y={y}
                width={w}
                height={BAR_HEIGHT}
                rx={1}
                fill="rgb(52 211 153 / 0.55)"
              />
            </g>
          );
        })}
      </svg>

      {/* Visible label/value legend, aligned to the bars above. */}
      <ul className="flex flex-col">
        {data.map((d, i) => (
          <li
            key={`${d.label}-${i}`}
            data-active={
              activeLabel !== undefined && d.label === activeLabel
                ? "true"
                : undefined
            }
            className="flex items-center justify-between gap-2 text-[11px]"
            style={{ height: ROW_HEIGHT }}
          >
            <span className="truncate text-console-muted">{d.label}</span>
            <span className="shrink-0 tabular-nums text-console-ink">
              {valueFormat(d.value)}
            </span>
          </li>
        ))}
      </ul>

      <SrOnlyTable
        title={title}
        head={["Category", "Value"]}
        rows={data.map((d) => [d.label, valueFormat(d.value)])}
      />
    </figure>
  );
}

/* ---------------------------------------------------------------- shared --- */

/**
 * Visually-hidden data table giving screen readers a real text alternative to
 * the decorative SVG. `sr-only`-equivalent classes are inlined (the project
 * has no jest-dom/sr-only utility guaranteed in config) using the canonical
 * clip technique.
 */
export function SrOnlyTable({
  title,
  head,
  rows,
}: {
  readonly title: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
}) {
  return (
    <table className={SR_ONLY} data-testid="chart-data-table">
      <caption>{title}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Empty-state figure shared by every chart — keeps the labelled group. */
export function EmptyFigure({
  title,
  message,
  className,
}: {
  readonly title: string;
  readonly message: string;
  readonly className?: string;
}) {
  return (
    <figure
      role="group"
      aria-label={title}
      className={cn("flex flex-col gap-1", className)}
    >
      <figcaption className="text-[10px] uppercase tracking-section text-console-faint">
        {title}
      </figcaption>
      <div className="rounded-sm border border-console-edge bg-console-panel/40 px-3 py-6 text-center text-[11px] italic text-console-faint">
        {message}
      </div>
    </figure>
  );
}

/**
 * Canonical visually-hidden ("sr-only") class string. Tailwind ships `sr-only`
 * in its base utilities, but we spell the rule out so the alternative text is
 * available regardless of which utilities survive purge in any consumer.
 */
export const SR_ONLY =
  "absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]";
