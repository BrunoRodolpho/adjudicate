"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * Uniform "nothing here yet" treatment for governance sections. Matches the
 * existing `italic text-faint` empty-row styling, centered within its container.
 */
export function EmptyState({ title, hint, icon, className }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 px-3 py-6 text-center",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="text-faint">
          {icon}
        </span>
      ) : null}
      <p className="text-[11px] italic text-faint">{title}</p>
      {hint ? <p className="text-[10px] text-faint/80">{hint}</p> : null}
    </div>
  );
}
