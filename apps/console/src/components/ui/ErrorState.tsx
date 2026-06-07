"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ErrorStateProps {
  message?: string;
  /** When provided, a keyboard-focusable Retry button is rendered. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Uniform error treatment for governance sections. Announced as an alert so
 * assistive tech surfaces it immediately. Retry is only offered when the caller
 * supplies a handler.
 */
export function ErrorState({ message = "Something went wrong", onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-3 py-6 text-center",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] text-red-300">
        <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
        {message}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-sm border border-edge bg-canvas px-3 py-1 text-[10px] uppercase tracking-section text-muted hover:border-ink/30 hover:text-ink focus:border-ink/30 focus:outline-none"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
