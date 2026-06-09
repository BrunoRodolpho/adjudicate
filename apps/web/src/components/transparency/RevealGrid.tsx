"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  makeStaggerContainer,
  revealVariants,
  REVEAL_VIEWPORT,
} from "@/lib/motion";

/**
 * RevealGrid — a `<ul>` that staggers its `<li>` children into view on scroll.
 *
 * A thin variant of the shared `Stagger` kit that *forwards `data-testid`* to
 * the rendered `<ul>`, so it can replace a plain `<ul data-testid=…>` (such as
 * the transparency red-team defenses grid) without dropping the test hook.
 *
 * Children should be wrapped in `RevealGridItem` (which carries the
 * `revealVariants`). Reduced-motion-safe: under `prefers-reduced-motion` the
 * list and items render as plain elements, fully visible, with no motion.
 */
export function RevealGrid({
  children,
  className,
  stagger = 0.08,
  delay = 0.04,
  "data-testid": dataTestid,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly stagger?: number;
  readonly delay?: number;
  readonly "data-testid"?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <ul className={className} data-testid={dataTestid}>
        {children}
      </ul>
    );
  }

  return (
    <motion.ul
      className={className}
      data-testid={dataTestid}
      variants={makeStaggerContainer(stagger, delay)}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </motion.ul>
  );
}

/**
 * RevealGridItem — a single `<li>` driven by its parent `RevealGrid`. Carries
 * `revealVariants` and forwards the data hooks / a11y props a transparency card
 * needs. Under reduced motion it renders a plain `<li>`.
 */
export function RevealGridItem({
  children,
  className,
  role,
  "aria-label": ariaLabel,
  "data-testid": dataTestid,
  "data-pack": dataPack,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly role?: string;
  readonly "aria-label"?: string;
  readonly "data-testid"?: string;
  readonly "data-pack"?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <li
        className={className}
        role={role}
        aria-label={ariaLabel}
        data-testid={dataTestid}
        data-pack={dataPack}
      >
        {children}
      </li>
    );
  }

  return (
    <motion.li
      className={className}
      role={role}
      aria-label={ariaLabel}
      data-testid={dataTestid}
      data-pack={dataPack}
      variants={revealVariants}
    >
      {children}
    </motion.li>
  );
}
