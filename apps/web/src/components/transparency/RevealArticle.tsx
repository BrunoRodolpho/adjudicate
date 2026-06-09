"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import {
  makeStaggerContainer,
  revealVariants,
  REVEAL_VIEWPORT,
} from "@/lib/motion";

/**
 * RevealArticle — a `<article>` that fades + rises into view on scroll and
 * staggers any `RevealSection` children inside it. Used for the AI-BOM pack
 * cards, where the whole card should settle in and its grouped sections cascade.
 *
 * Reduced-motion-safe: under `prefers-reduced-motion` the article and its
 * sections render plainly, fully visible, with no motion.
 */
export function RevealArticle({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <article className={className}>{children}</article>;
  }

  return (
    <motion.article
      className={className}
      variants={makeStaggerContainer(0.06, 0.05)}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
    >
      {children}
    </motion.article>
  );
}

/**
 * RevealSection — a grouped block inside a `RevealArticle`, driven by the parent
 * stagger. Renders as a plain `<div>` under reduced motion.
 */
export function RevealSection({
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
    <motion.div className={className} variants={revealVariants}>
      {children}
    </motion.div>
  );
}
