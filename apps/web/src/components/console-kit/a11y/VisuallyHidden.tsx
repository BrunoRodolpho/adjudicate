import { createElement, type JSX, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
  readonly children: ReactNode;
  /**
   * The element to render. Defaults to a `<span>`. Use `as="div"` (or another
   * block-level tag) when the hidden content must sit between block siblings,
   * since a `<span>` between block elements is invalid in some contexts.
   */
  readonly as?: keyof JSX.IntrinsicElements;
  readonly className?: string;
}

/**
 * Renders its children using the standard `sr-only` clip-rect technique so
 * assistive technology reads the text while it contributes nothing to the
 * visual layout. Tailwind's built-in `sr-only` utility applies the
 * clip/position/size rules; we expose `as`/`className` for the few callers
 * that need a different host element or to layer in a `focus:not-sr-only`
 * reveal (see {@link SkipLink}).
 *
 * Ported verbatim from apps/console (ADR-128: copy, don't share). No color
 * tokens, so no rename needed.
 */
export function VisuallyHidden({ children, as = "span", className }: Props) {
  return createElement(as, { className: cn("sr-only", className) }, children);
}
