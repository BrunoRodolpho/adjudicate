import { ArrowRight, ScrollText } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * ConsoleHandoff — the bridge from the playground receipt to the operator
 * console. Server component (no interactivity beyond the link).
 *
 * Sits on the light marketing canvas but lightly echoes the console's dark
 * aesthetic with a small inset "console chip" so the reader understands that
 * the receipt they just produced is the same artifact the real Audit Explorer
 * renders. Links to `/console/audit-explorer`.
 *
 * The copy is context-aware so the bridge reads as a value-driven next step
 * rather than boilerplate: a mid-story guided step hints that more receipts
 * will accumulate; the final step frames the whole run; the sandbox uses the
 * generic single-receipt framing.
 */

export type ConsoleHandoffContext = "guided-step" | "guided-final" | "sandbox";

const COPY: Record<
  ConsoleHandoffContext,
  { readonly title: string; readonly hint: string }
> = {
  "guided-step": {
    title: "Receipts like this populate your operator console",
    hint: "Open the Audit Explorer to see how tamper-evident receipts land in the live feed.",
  },
  "guided-final": {
    title: "Every step above produced a tamper-evident receipt",
    hint: "View them together in the Audit Explorer, exactly as an operator would.",
  },
  sandbox: {
    title: "This receipt would now appear in your operator console",
    hint: "Open the Audit Explorer to see how tamper-evident receipts land in the live feed.",
  },
};

export function ConsoleHandoff({
  className,
  context = "sandbox",
}: {
  readonly className?: string;
  readonly context?: ConsoleHandoffContext;
}) {
  const { title, hint } = COPY[context];
  return (
    <Link
      href="/console/audit-explorer"
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-edge bg-surface p-4 transition hover:border-ink/30 hover:shadow-md",
        className,
      )}
    >
      {/* Dark console chip — a small inset echo of the operator console. */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-console-canvas text-console-ink ring-1 ring-console-edge"
        aria-hidden
      >
        <ScrollText className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{hint}</span>
      </span>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}
