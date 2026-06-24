"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ConsoleHandoff } from "@/components/playground/ConsoleHandoff";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import { resultRevealVariants } from "@/lib/motion";
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
 * Motion: the run is the point, so the receipt (and the error alert) fade +
 * rise in when they land — the same "materialization" beat the guided step
 * uses. The spinner stays gated behind `motion-reduce:animate-none`. Under
 * `prefers-reduced-motion` the whole result region renders immediately with no
 * transform (the `useReducedMotion` short-circuit).
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
  const reduce = useReducedMotion();
  const motionProps = reduce
    ? {}
    : {
        initial: "hidden" as const,
        animate: "visible" as const,
        variants: resultRevealVariants,
      };

  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      aria-live="polite"
      aria-busy={busy}
    >
      {busy ? (
        <div className="flex items-center gap-3 rounded-xl border border-console-edge bg-console-panel px-4 py-3 text-sm text-console-muted">
          <Loader2
            size={16}
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
          Running the kernel…
        </div>
      ) : null}

      {error && !busy ? (
        <motion.div
          {...motionProps}
          role="alert"
          className="flex gap-3 rounded-xl border border-refuse/40 bg-refuse/5 p-4"
        >
          <AlertTriangle
            size={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-refuse"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold text-console-ink">
              That run could not be adjudicated
            </p>
            <p className="break-words text-sm leading-relaxed text-console-muted">
              {error}
            </p>
          </div>
        </motion.div>
      ) : null}

      {result && !busy ? (
        <motion.div {...motionProps} className="flex flex-col gap-4">
          <ReceiptCard result={result} variant="full" />
          <ConsoleHandoff context="sandbox" />
        </motion.div>
      ) : null}

      {!result && !error && !busy ? (
        <EmptyState
          title="Your receipt will appear here"
          hint="Configure a Pack and intent, edit the payload, and run the real kernel. The receipt below shows every decision step, guard match, and signature — ideal for testing edge cases or debugging policy rules."
          className="border-console-edge text-console-muted"
        />
      ) : null}
    </div>
  );
}
