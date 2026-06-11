import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lead — the standfirst that opens a post body: one larger, calmer paragraph
 * that sets the shape before the technical detail. Replaces the ad-hoc
 * `text-lg italic` first paragraph the posts hand-rolled.
 */
export function Lead({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <p className={cn("text-lead-lg leading-relaxed text-ink", className)}>
      {children}
    </p>
  );
}

/**
 * PullQuote — a mid-article emphasis line, set off with a brand rule. Used to
 * surface the one sentence a reader should leave with.
 */
export function PullQuote({
  children,
  cite,
  className,
}: {
  readonly children: ReactNode;
  readonly cite?: string;
  readonly className?: string;
}) {
  return (
    <blockquote
      className={cn(
        "my-stack border-l-2 border-brand pl-5 text-lead font-medium text-ink",
        className,
      )}
    >
      {children}
      {cite ? (
        <cite className="mt-2 block text-body-sm not-italic text-muted">
          — {cite}
        </cite>
      ) : null}
    </blockquote>
  );
}
