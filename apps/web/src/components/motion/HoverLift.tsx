"use client";

import { useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";
import { resolveMotion } from "./resolveMotion";
import { EASE_OUT } from "@/lib/motion";

/**
 * HoverLift — a wrapper that gives its child a tasteful hover affordance: a
 * small upward translate plus a shadow increase, so interactive cards signal
 * "this responds." Transform/opacity-only (translateY + box-shadow), so it
 * never reflows neighbours.
 *
 * Used for the homepage's interactive cards: WhoItsFor, DepthLinks, and the
 * hero outcome cells. Pair with a `Card`/border element as the child.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set, the lift is
 * dropped entirely — only the shadow increases on hover (no translate), which
 * keeps the affordance without vestibular motion. The optional glow is also
 * suppressed under reduced motion.
 *
 * Easing/feel matches the site's entrance curve (EASE_OUT) at ~200ms.
 */
export function HoverLift({
  children,
  className,
  as: As = "div",
  lift = 5,
  glow = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Element type to render as the wrapper. Defaults to `div`. */
  readonly as?: ElementType;
  /** Pixels to translate upward on hover (clamped sensible range). */
  readonly lift?: number;
  /** When true, adds a soft brand-tinted glow ring on hover (motion only). */
  readonly glow?: boolean;
}) {
  const reduce = useReducedMotion();
  const MotionComponent = resolveMotion(As);

  const restShadow = "0 1px 2px rgba(15, 23, 42, 0.04)";
  const hoverShadow = glow
    ? "0 12px 32px rgba(139, 92, 246, 0.18), 0 4px 10px rgba(15, 23, 42, 0.10)"
    : "0 12px 28px rgba(15, 23, 42, 0.12)";

  if (reduce) {
    // Shadow change only — no transform, no glow ring.
    return (
      <MotionComponent
        className={className}
        initial={{ boxShadow: restShadow }}
        whileHover={{ boxShadow: hoverShadow }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {children}
      </MotionComponent>
    );
  }

  return (
    <MotionComponent
      className={className}
      initial={{ y: 0, boxShadow: restShadow }}
      whileHover={{ y: -lift, boxShadow: hoverShadow }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      {children}
    </MotionComponent>
  );
}
