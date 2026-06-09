"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { drawVariants, REVEAL_VIEWPORT } from "@/lib/motion";

/**
 * React's DOM animation/drag event handlers collide with framer-motion's
 * re-typed versions of the same names. We don't expose them on these draw
 * wrappers, so omit them to keep plain-SVG and motion-SVG prop types aligned.
 */
type MotionConflictingKeys =
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd";

type SvgWrapperProps = Omit<
  ComponentPropsWithoutRef<"svg">,
  MotionConflictingKeys
>;
type PathWrapperProps = Omit<
  ComponentPropsWithoutRef<"path">,
  MotionConflictingKeys
>;

/**
 * DrawOnScroll — wraps an inline SVG and "draws" its strokes when the SVG
 * scrolls into view: each path's `pathLength` animates 0 → 1 (with a short
 * opacity lead-in) so the diagram appears to be inked in.
 *
 * Usage: render an `<svg>`'s worth of content as children, but use
 * `<DrawOnScroll.Path>` for any path/line/group that should be drawn. The
 * outer wrapper is the `motion.svg` that orchestrates the children via
 * `staggerChildren`; each `<DrawOnScroll.Path>` carries `drawVariants`.
 *
 *   <DrawOnScroll viewBox="0 0 100 40" className="...">
 *     <DrawOnScroll.Path d="M0 20 H100" stroke="currentColor" />
 *   </DrawOnScroll>
 *
 * Used for the homepage connector arrows between "get started" step cards and
 * any small inline diagram that benefits from a sense of construction.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set, the SVG renders
 * as a plain, fully-drawn `<svg>` (paths at `pathLength` 1, full opacity) —
 * no stroke animation, no scroll gating.
 *
 * Transform/opacity-only: `pathLength` is a presentation attribute, so no
 * layout shift; the SVG occupies its box from first paint.
 */
export function DrawOnScroll({
  children,
  stagger = 0.12,
  ...svgProps
}: SvgWrapperProps & {
  readonly children: ReactNode;
  /** Per-path stagger spacing when multiple paths are drawn, in seconds. */
  readonly stagger?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    // Plain SVG: children rendered fully drawn (see DrawOnScroll.Path).
    return <svg {...svgProps}>{children}</svg>;
  }

  return (
    <motion.svg
      {...svgProps}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.svg>
  );
}

/**
 * A single drawable stroke inside a `<DrawOnScroll>`. Under motion it carries
 * `drawVariants` so the parent SVG can ink it in; under reduced motion it
 * renders as a plain `<path>` (fully drawn, full opacity).
 */
function DrawPath({ ...pathProps }: PathWrapperProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <path {...pathProps} />;
  }

  return <motion.path {...pathProps} variants={drawVariants} />;
}

DrawOnScroll.Path = DrawPath;
