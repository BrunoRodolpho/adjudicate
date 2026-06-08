"use client";

import { cn } from "@/lib/cn";

export interface SkeletonProps {
  /** Number of shimmer bars to render. Defaults to 3. Values < 1 are clamped to 1. */
  lines?: number;
  className?: string;
}

/**
 * Content-loading placeholder. Renders N animated shimmer bars that stand in for
 * a section's eventual rows. Announced to assistive tech as a busy status region
 * with a visually-hidden "Loading" label.
 *
 * Ported from apps/console (ADR-128: copy, don't share). Token classes were
 * renamed to the console.* dark namespace.
 */
export function Skeleton({ lines = 3, className }: SkeletonProps) {
  const count = Math.max(1, Math.floor(lines));

  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="skeleton"
      className={cn("flex flex-col gap-2 px-3 py-3", className)}
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={cn(
            "h-2 animate-pulse rounded-sm border border-console-edge bg-console-panel",
            // Vary the final bar's width so the placeholder doesn't read as a solid block.
            i === count - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}
