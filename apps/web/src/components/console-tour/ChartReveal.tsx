"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { revealVariants, REVEAL_VIEWPORT, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * Table rows render visible by default (no opacity gate) so the table is never
 * blank in SSR / no-JS / crawlers (WS-A). Transforms on `<tr>` are unreliable,
 * so there is no row-level entrance — the rows simply exist; the surrounding
 * ChartReveal container still provides the section-level reveal.
 */
const ROW_FADE: Variants = {
  hidden: {},
  visible: { opacity: 1, transition: { duration: 0.4, ease: EASE_OUT } },
};

/**
 * ChartReveal — the shared "AnimatedChart" entrance wrapper for every console
 * replica chart (OutcomeChart, TimelineChart, BarDistribution, StackedAreaChart)
 * and any other key visual that should land with a gentle reveal rather than
 * flat on first paint (AUDIT round-2: "create a shared AnimatedChart wrapper …
 * reuse across all charts").
 *
 * It deliberately does NOT fork the charts: the charts stay pure, deterministic
 * server-renderable SVG (path geometry computed over props, no measurement). We
 * only wrap their CONTAINER and fade + rise it into view once — transform /
 * opacity only, so the SVG's viewBox never shifts and there is no layout reflow.
 *
 * Reduced-motion-safe: under `prefers-reduced-motion: reduce` the wrapper renders
 * a plain `div` with the chart fully visible from the first frame — no fade, no
 * rise, no scroll-gated invisibility. Animation data is shared from lib/motion.ts
 * so the cadence stays in lock-step with the rest of the site's reveal feel.
 */
export function ChartReveal({
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

/**
 * RevealRows — a `<tbody>` (or any element) that staggers its child rows in as it
 * scrolls into view. Used for replica tables/lists where rows should cascade
 * rather than land all at once (token budgets, blocked commands, integrity
 * seals). Children should be wrapped in {@link RevealRow}.
 *
 * Reduced-motion-safe: renders a plain element with rows fully visible. Rows
 * fade (opacity-only for `<tr>`; fade + small rise for list/div rows), so the
 * table never reflows.
 */
export function RevealRows({
  children,
  className,
  as = "tbody",
  stagger = 0.05,
  ...rest
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Element to render as. Defaults to `tbody` for table bodies. */
  readonly as?: "tbody" | "ul" | "ol" | "div";
  /** Per-row stagger spacing, in seconds. */
  readonly stagger?: number;
} & Record<`data-${string}`, string | undefined>) {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: 0.04 } },
  };

  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className} {...rest}>
        {children}
      </Plain>
    );
  }

  const M = MOTION_BY_TAG[as];
  return (
    <M
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      {...rest}
    >
      {children}
    </M>
  );
}

/**
 * A single staggered row inside {@link RevealRows}. Carries the fade variants so
 * the parent can drive its entrance; arbitrary `data-*` attributes are forwarded
 * (replica rows tag themselves with `data-band`, `data-pack`, etc.). Under
 * reduced motion it renders a plain element (the parent already short-circuits).
 */
export function RevealRow({
  children,
  className,
  as = "tr",
  ...rest
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: "tr" | "li" | "div";
} & Record<`data-${string}`, string | undefined>) {
  const reduce = useReducedMotion();
  // `<tr>` fades only (transforms on table rows are unreliable); other tags get
  // the shared fade + rise.
  const variants = as === "tr" ? ROW_FADE : revealVariants;

  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className} {...rest}>
        {children}
      </Plain>
    );
  }

  const M = MOTION_BY_TAG[as];
  return (
    <M className={className} variants={variants} {...rest}>
      {children}
    </M>
  );
}

/**
 * RevealStack — a container that staggers a column of panels/sections in as it
 * scrolls into view. Wrap each direct child in {@link RevealStackItem}. Used for
 * the AI-BOM detail pane's section stack (Model, Conformance, Tools, …) so the
 * detail panel cascades in rather than dumping flat.
 *
 * Reduced-motion-safe: plain `div`, children fully visible. Transform/opacity
 * only — no layout shift.
 */
export function RevealStack({
  children,
  className,
  stagger = 0.06,
  ...rest
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly stagger?: number;
} & Record<`data-${string}`, string | undefined>) {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: 0.04 } },
  };

  if (reduce) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(className)}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** A single staggered panel inside {@link RevealStack}. */
export function RevealStackItem({
  children,
  className,
  ...rest
}: {
  readonly children: ReactNode;
  readonly className?: string;
} & Record<`data-${string}`, string | undefined>) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} variants={revealVariants} {...rest}>
      {children}
    </motion.div>
  );
}

/** Stable framer-motion components for the tags these wrappers render. */
const MOTION_BY_TAG = {
  tbody: motion.tbody,
  tr: motion.tr,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  div: motion.div,
} as const;
