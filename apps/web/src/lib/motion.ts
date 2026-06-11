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
 * Gentle upward rise. Designed for `whileInView` with
 * `viewport={REVEAL_VIEWPORT}` — see usage in section wrappers.
 *
 * Progressive-enhancement contract (WS-A): the hidden state is TRANSFORM-ONLY
 * (no opacity). framer-motion bakes `initial="hidden"` into the server HTML, so
 * keeping opacity at 1 means content is fully visible without JS, before scroll,
 * for crawlers, print, and screenshots — the entrance is a layered enhancement
 * (a 12px rise), never a gate on whether content exists. Reduced-motion paths
 * short-circuit to plain elements (already handled in each wrapper).
 */
export const revealVariants: Variants = {
  hidden: { y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

/**
 * Result materialization — fade + small rise, tuned for an `animate`-on-mount
 * moment rather than a scroll reveal (slightly quicker than `revealVariants`).
 *
 * Use for content that appears in response to a user action and should feel
 * "earned" the instant it lands: the playground's guided step result and the
 * sandbox receipt. Pair `initial="hidden"` + `animate="visible"` on a
 * `motion.div`. Transform/opacity-only (no layout shift). Always gate behind a
 * `useReducedMotion()` short-circuit so reduced-motion renders the content
 * immediately with no transform.
 */
export const resultRevealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};

/**
 * Disclosure slide-down — for a receipt (or panel) that expands beneath a
 * toggle. Fades + rises in with a short lead-in delay so it reads as a
 * follow-on to the click rather than a simultaneous flash. Transform/opacity
 * only; pair with a `useReducedMotion()` short-circuit.
 */
export const disclosureRevealVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT, delay: 0.1 },
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

/**
 * Build a stagger container with a custom child spacing / lead-in delay.
 * Same contract as `staggerContainer` (children carry `revealVariants`),
 * but lets callers dial the cadence per section. Spacing in seconds.
 */
export function makeStaggerContainer(
  staggerSeconds = 0.08,
  delaySeconds = 0.04,
): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerSeconds,
        delayChildren: delaySeconds,
      },
    },
  };
}

/**
 * SVG stroke "draw-on" variants for `motion.path` (and friends).
 * Animates `pathLength` 0 → 1 plus a short opacity lead-in so the stroke
 * appears to be drawn as it scrolls into view. Transform/opacity-class only
 * (no layout) — pathLength is a presentation attribute, not geometry.
 *
 * Pair `initial="hidden"` + `whileInView="visible"` (or drive from a parent
 * container's variants) and set `viewport={REVEAL_VIEWPORT}`.
 */
export const drawVariants: Variants = {
  // Transform/draw-only hidden state (no opacity) so the SVG element is present
  // and the stroke geometry exists in SSR; only `pathLength` (the draw-on) is
  // animated when JS runs. Decorative strokes, never load-bearing content.
  hidden: { pathLength: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.9, ease: EASE_OUT },
      opacity: { duration: 0.2, ease: EASE_OUT },
    },
  },
};
