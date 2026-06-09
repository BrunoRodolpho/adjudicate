"use client";

import {
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

/**
 * Default formatter — integer with locale grouping (e.g. 1,200).
 */
function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * CountUp — animates a number from 0 up to `value` once it scrolls into
 * view, easing out so it settles rather than snaps. Built on framer-motion's
 * `useMotionValue` + `animate` (driven imperatively into local state so the
 * formatted string stays in our control).
 *
 * Used for kinetic stats: the social-proof StatTile values ("150+ tests",
 * "25 capabilities") that otherwise read as static badges.
 *
 * Reduced-motion-safe: when `prefers-reduced-motion` is set, the final
 * formatted value renders immediately — no counting, no scroll gating.
 *
 * Output is wrapped in a `<span>` so it drops into any inline context (e.g.
 * a StatTile's value slot). Pass `prefix`/`suffix` for units like "+" or "$".
 */
export function CountUp({
  value,
  format = defaultFormat,
  durationMs = 1000,
  prefix,
  suffix,
  className,
}: {
  readonly value: number;
  /** Format the in-flight number into display text. Defaults to grouped int. */
  readonly format?: (n: number) => string;
  /** Total run time of the count, in milliseconds. */
  readonly durationMs?: number;
  /** Static text rendered before the number (e.g. "$"). */
  readonly prefix?: string;
  /** Static text rendered after the number (e.g. "+"). */
  readonly suffix?: string;
  readonly className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // once: fire a single time when it enters; margin matches REVEAL_VIEWPORT.
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const motionValue = useMotionValue(0);

  // Keep the latest formatter in a ref so the animation effect can read it
  // without re-subscribing when callers pass an inline (unstable) function.
  const formatRef = useRef(format);
  formatRef.current = format;

  // Start at the final value (avoids a "0" flash for reduced-motion users and
  // before hydration); the count effect below resets to 0 when it actually
  // runs. `reduce` is null on first paint, so a final-value start is safe.
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    if (reduce) {
      setDisplay(formatRef.current(value));
      return;
    }
    if (!inView) return;
    // Reset to 0 then count up so the motion is visible on entry.
    motionValue.set(0);
    setDisplay(formatRef.current(0));
    const controls = animate(motionValue, value, {
      duration: durationMs / 1000,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(formatRef.current(latest)),
    });
    return () => controls.stop();
  }, [reduce, inView, value, durationMs, motionValue]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
