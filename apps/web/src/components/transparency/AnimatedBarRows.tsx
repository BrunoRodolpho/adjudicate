"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  EASE_OUT,
  makeStaggerContainer,
  revealVariants,
  REVEAL_VIEWPORT,
} from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * A single bar-chart row in a transparency aggregate table.
 *
 * `cells` are the leading <th scope="row"> / <td> content (rendered verbatim),
 * followed by an automatically-rendered bar cell driven by `widthPct` +
 * `display`. The shape is kept generic so both the PII table (sensitivity ×
 * disposition) and the command-risk table (category) can share it.
 */
export interface BarRow {
  /** Stable React key. */
  readonly key: string;
  /** Leading non-bar cells, already wrapped in <th>/<td>. */
  readonly leading: React.ReactNode;
  /** Bar fill width, 0–100, computed server-side against the visible cohort. */
  readonly widthPct: number;
  /** The censored/display count string (e.g. "12" or "<5"). */
  readonly display: string;
  /** When true, render the small-cohort-floor screen-reader note. */
  readonly censored: boolean;
}

/**
 * AnimatedBarRows — client tbody that reveals each transparency table row on
 * scroll and fills its bar from zero, exactly once. Built on the shared motion
 * kit so the cadence matches the rest of the site.
 *
 * - Rows: staggered fade + small rise via `revealVariants` (transform/opacity
 *   only — no layout shift), driven by a `staggerContainer` on the <tbody>.
 * - Bars: width 0 → `widthPct`% on first reveal. Width is animated (not a
 *   transform) deliberately — the bar lives inside a fixed-height clipped track,
 *   so growing its width never reflows neighbours; this is the documented
 *   exception for progress bars in the AUDIT motion plan.
 * - Hover: a subtle brightness lift on the bar so rows feel live (motion only).
 *
 * Reduced-motion-safe: under `prefers-reduced-motion` everything renders at its
 * final state immediately — no reveal gating, no fill animation, no hover
 * brightness — so the table is fully readable with zero motion.
 *
 * The exact column structure (how many leading cells, their styling) is owned
 * by the caller via `rows[].leading`; this component only owns the bar cell and
 * the motion.
 */
export function AnimatedBarRows({
  rows,
  floor,
}: {
  readonly rows: readonly BarRow[];
  /** Cohort floor, surfaced in the censored screen-reader note. */
  readonly floor: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className="border-b border-edge last:border-b-0"
          >
            {row.leading}
            <BarCell
              widthPct={row.widthPct}
              display={row.display}
              censored={row.censored}
              floor={floor}
              animate={false}
            />
          </tr>
        ))}
      </tbody>
    );
  }

  return (
    <motion.tbody
      variants={makeStaggerContainer(0.07, 0.04)}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {rows.map((row) => (
        <motion.tr
          key={row.key}
          variants={revealVariants}
          className="group border-b border-edge last:border-b-0"
        >
          {row.leading}
          <BarCell
            widthPct={row.widthPct}
            display={row.display}
            censored={row.censored}
            floor={floor}
            animate
          />
        </motion.tr>
      ))}
    </motion.tbody>
  );
}

function BarCell({
  widthPct,
  display,
  censored,
  floor,
  animate,
}: {
  readonly widthPct: number;
  readonly display: string;
  readonly censored: boolean;
  readonly floor: number;
  readonly animate: boolean;
}) {
  return (
    <td className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-sm bg-canvas"
          aria-hidden="true"
        >
          {animate ? (
            <motion.div
              className={cn(
                "h-full rounded-sm bg-ink/70 transition-[filter] duration-200",
                "group-hover:brightness-125",
              )}
              initial={{ width: 0 }}
              whileInView={{ width: `${widthPct}%` }}
              viewport={REVEAL_VIEWPORT}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
            />
          ) : (
            <div
              className="h-full rounded-sm bg-ink/70"
              style={{ width: `${widthPct}%` }}
            />
          )}
        </div>
        <span className="w-12 shrink-0 text-right font-medium tabular-nums text-ink">
          {display}
        </span>
        {censored ? (
          <span className="sr-only">
            fewer than {floor}, exact count suppressed by the small-cohort floor
          </span>
        ) : null}
      </div>
    </td>
  );
}
