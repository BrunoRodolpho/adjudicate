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
 */
export function ConsoleHandoff({ className }: { readonly className?: string }) {
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
        <span className="block text-sm font-medium text-ink">
          This receipt would now appear in your operator console
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">
          Open the Audit Explorer to see how signed receipts land in the live
          feed.
        </span>
      </span>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}
