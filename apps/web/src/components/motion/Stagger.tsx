"use client";

import { useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import { resolveMotion } from "./resolveMotion";
import {
  makeStaggerContainer,
  revealVariants,
  REVEAL_VIEWPORT,
} from "@/lib/motion";

/**
 * Stagger — a container that reveals its children in sequence as it scrolls
 * into view. Each direct child should be wrapped in `<Stagger.Item>` (which
 * carries `revealVariants`); the container drives them via `staggerContainer`.
 *
 * Used for grids and rails where elements should cascade in rather than land
 * all at once: the hero outcome strip, the receipt annotation rail, the
 * "get started" step cards, and secondary homepage sections.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set, both the
 * container and items render as plain elements with content fully visible —
 * no fade, no rise, no scroll-gated invisibility.
 *
 * Animation data is shared from lib/motion.ts so the cadence stays in
 * lock-step with the rest of the site's reveal feel.
 */
export function Stagger({
  children,
  className,
  as: As = "div",
  stagger = 0.08,
  delay = 0.04,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Element type to render as the container. Defaults to `div`. */
  readonly as?: ElementType;
  /** Per-child stagger spacing, in seconds. */
  readonly stagger?: number;
  /** Lead-in delay before the first child reveals, in seconds. */
  readonly delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <As className={className}>{children}</As>;
  }

  const MotionComponent = resolveMotion(As);

  return (
    <MotionComponent
      className={className}
      variants={makeStaggerContainer(stagger, delay)}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </MotionComponent>
  );
}

/**
 * A single staggered child. Carries `revealVariants` so the parent
 * `<Stagger>` can drive its entrance. Under reduced motion it renders as a
 * plain element (the parent already short-circuits, but this keeps an
 * `<Stagger.Item>` usable in isolation too).
 */
export function StaggerItem({
  children,
  className,
  as: As = "div",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Element type to render as the item. Defaults to `div`. */
  readonly as?: ElementType;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <As className={className}>{children}</As>;
  }

  const MotionComponent = resolveMotion(As);

  return (
    <MotionComponent className={className} variants={revealVariants}>
      {children}
    </MotionComponent>
  );
}

Stagger.Item = StaggerItem;
