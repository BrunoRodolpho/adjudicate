"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { revealVariants, REVEAL_VIEWPORT } from "@/lib/motion";

/**
 * Reveal — a thin client wrapper that gently fades + rises its children into
 * view on scroll (opacity 0 → 1 + a small upward rise), exactly once.
 *
 * Used to wrap the four homepage Step sections so each step settles in as the
 * reader scrolls down the spine — subtle polish, never flashy.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set, the wrapper
 * renders a plain `div` with the content fully visible and no transform — no
 * fade, no rise, no scroll-gated invisibility.
 *
 * Animation data is shared from lib/motion.ts (`revealVariants` +
 * `REVEAL_VIEWPORT`, `once: true`) so this stays in lock-step with the rest of
 * the site's reveal feel.
 */
export function Reveal({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </motion.div>
  );
}
