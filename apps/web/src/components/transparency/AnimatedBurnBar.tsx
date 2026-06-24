"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CountUp } from "@/components/motion/CountUp";
import { EASE_OUT, REVEAL_VIEWPORT } from "@/lib/motion";

/**
 * AnimatedBurnBar — the token-budget burn-down visual: a big percentage, a band
 * label, and a fill bar, all animating in once on scroll.
 *
 * - Percentage: counts 0 → `pctUsed` via the shared `CountUp` (tabular-nums).
 * - Fill: grows from empty to `pctUsed`% using `transform: scaleX` from a
 *   left origin, so it never reflows the surrounding card (no layout shift).
 *   The bar sits in a fixed-width track; scaling X is purely visual.
 *
 * Band is always conveyed by the text label + the accessible `role="img"`
 * fallback, never by colour or motion alone.
 *
 * Reduced-motion-safe: under `prefers-reduced-motion` the percentage shows its
 * final value immediately (CountUp handles that) and the bar renders at its
 * final width with no fill animation.
 */
export function AnimatedBurnBar({
  pctUsed,
  bandLabel,
  barClass,
  textClass,
}: {
  readonly pctUsed: number;
  readonly bandLabel: string;
  /** Tailwind class for the fill colour (band-tinted). */
  readonly barClass: string;
  /** Tailwind class for the band label colour. */
  readonly textClass: string;
}) {
  const reduce = useReducedMotion();

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-console-ink">
          <CountUp value={pctUsed} suffix="%" />
        </span>
        <span
          className={`text-xs uppercase tracking-section ${textClass}`}
          data-testid="token-band"
        >
          {bandLabel}
        </span>
      </div>

      {/* Burn bar — role="img" with a full text fallback; band conveyed by
          text + the label above, never colour alone. The fill scales in from
          the left (transform-only) so it never reflows the card. */}
      <div
        role="img"
        aria-label={`Token budget: ${pctUsed}% used, ${bandLabel}`}
        className="mt-3 h-3 w-full overflow-hidden rounded-sm bg-console-canvas"
      >
        <div
          className="h-full w-full origin-left rounded-sm bg-console-canvas"
          style={{ transform: `scaleX(${pctUsed / 100})` }}
          aria-hidden="true"
        >
          {reduce ? (
            <div
              className={`h-full w-full origin-left rounded-sm ${barClass}`}
            />
          ) : (
            <motion.div
              className={`h-full w-full origin-left rounded-sm ${barClass}`}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={REVEAL_VIEWPORT}
              transition={{ duration: 1, ease: EASE_OUT, delay: 0.1 }}
            />
          )}
        </div>
      </div>
    </>
  );
}
