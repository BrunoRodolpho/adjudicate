"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { DECISIONS_ORDER } from "@/content/decisions";
import { EASE_OUT, makeStaggerContainer, REVEAL_VIEWPORT } from "@/lib/motion";

/** Fade + gentle scale-up for each chip, driven by the parent stagger. */
const chipVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};

/**
 * FooterChips — the six decision outcomes rendered as a brand signature in the
 * footer. Each chip fades + scales in with a small stagger when the footer
 * scrolls into view, exactly once.
 *
 * Reduced-motion-safe: under `prefers-reduced-motion` the chips render plainly,
 * fully visible, with no scale or fade. Transform/opacity-only either way (no
 * layout shift).
 */
export function FooterChips() {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <ul
        aria-label="The six decision outcomes"
        className="flex flex-wrap gap-1.5"
      >
        {DECISIONS_ORDER.map((kind) => (
          <li key={kind}>
            <DecisionChip kind={kind} size="sm" />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <motion.ul
      aria-label="The six decision outcomes"
      className="flex flex-wrap gap-1.5"
      variants={makeStaggerContainer(0.06, 0.02)}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {DECISIONS_ORDER.map((kind) => (
        <motion.li key={kind} variants={chipVariants}>
          <DecisionChip kind={kind} size="sm" />
        </motion.li>
      ))}
    </motion.ul>
  );
}
