"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ButtonProps {
  readonly children: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly variant?: "primary" | "ghost" | "outline";
  readonly external?: boolean;
  readonly className?: string;
}

const STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  // Single solid brand accent (the 3-stop gradient is retired from buttons and
  // survives only as a rare hero flourish) — blueprint §4.4.
  primary:
    "bg-brand text-white shadow-xs transition-all hover:bg-brand-ink hover:shadow-sm",
  ghost: "bg-transparent text-ink hover:bg-edge",
  outline: "border border-edge bg-surface text-ink hover:border-ink/40",
};

export function Button({
  children,
  href,
  onClick,
  variant = "primary",
  external,
  className,
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium tracking-tight focus-ring",
    STYLES[variant],
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
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
