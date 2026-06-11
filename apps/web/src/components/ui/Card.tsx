import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Bordered, hover-lift card. When `href` is set it becomes a link
 * (internal next/link, or `<a target="_blank">` when `external`); otherwise
 * a plain container. Server component.
 */
export function Card({
  children,
  className,
  href,
  external,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href?: string;
  readonly external?: boolean;
}) {
  const classes = cn(
    // Hairline ring + soft elevation at rest; interactive cards lift + bloom on
    // hover and settle on press (reduced-motion-safe).
    "block rounded-xl bg-surface p-5 shadow-sm ring-1 ring-edge/70",
    href &&
      "transition-all duration-150 hover:shadow-md hover:ring-edge-strong motion-safe:hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm focus-ring",
    className,
  );

  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={classes}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return <div className={classes}>{children}</div>;
}
