import type { Variants } from "framer-motion";

/**
 * Shared framer-motion data. Plain module (no "use client") so it can be
 * imported by both server-rendered wrappers and client motion components.
 *
 * Easing curves mirror the homepage feel: an "easeOut"-style cubic-bezier
 * for entrance, a gentler curve for emphasis.
 */

/** Standard entrance easing (≈ ease-out). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Gentler easing for emphasis / scale moves. */
export const EASE_SOFT = [0.16, 1, 0.3, 1] as const;

/** Canonical viewport config for `whileInView` reveals. */
export const REVEAL_VIEWPORT = { once: true, margin: "-50px" } as const;

/**
 * Fade + small rise. Designed for `whileInView` with
 * `viewport={REVEAL_VIEWPORT}` — see usage in section wrappers.
 */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

/**
 * Parent container that staggers children carrying `revealVariants`.
 * Pair `initial="hidden"` + `whileInView="visible"` on the container and
 * give each child `variants={revealVariants}`.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};
