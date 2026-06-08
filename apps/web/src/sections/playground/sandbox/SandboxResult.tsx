"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { ConsoleHandoff } from "@/components/playground/ConsoleHandoff";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import { cn } from "@/lib/cn";

/**
 * SandboxResult — the right-hand outcome rail.
 *
 * Pure presentation: the parent owns the fetch and passes down `result` /
 * `error` / `busy`. On success it renders the full ReceiptCard plus the
 * ConsoleHandoff bridge. Errors (invalid input the form let through, or a
 * kernel/transport failure) render in a refuse-tinted box so a failed run is
 * unmistakable but never alarming.
 *
 * Reduced-motion: the only animation is the spinner, gated behind
 * `motion-reduce:animate-none`.
 */
export function SandboxResult({
  result,
  error,
  busy,
  className,
}: {
  readonly result: PlaygroundResponse | null;
  readonly error: string | null;
  readonly busy: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      aria-live="polite"
      aria-busy={busy}
    >
      {busy ? (
        <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-muted">
          <Loader2
            size={16}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          Running the kernel…
        </div>
      ) : null}

      {error && !busy ? (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-refuse/40 bg-refuse/5 p-4"
        >
          <AlertTriangle
            size={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-refuse"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold text-ink">
              That run could not be adjudicated
            </p>
            <p className="break-words text-sm leading-relaxed text-muted">
              {error}
            </p>
          </div>
        </div>
      ) : null}

      {result && !busy ? (
        <>
          <ReceiptCard result={result} variant="full" />
          <ConsoleHandoff />
        </>
      ) : null}

      {!result && !error && !busy ? (
        <EmptyState
          title="No run yet"
          hint="Adjust the inputs on the left and press Run to see the real kernel decision and its signed receipt here."
          className="border-edge text-muted"
        />
      ) : null}
    </div>
  );
}
