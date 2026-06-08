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
    "block rounded-xl border border-edge bg-surface p-5 transition hover:shadow-md",
    href && "hover:border-ink/30",
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
