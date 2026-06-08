import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ConsoleChromeProps {
  /**
   * Optional caption shown beside the mac-style browser dots, e.g.
   * `"audit-explorer · localhost:5180"`. Purely decorative chrome text.
   */
  readonly caption?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Dark "operator console" chrome wrapper — the HONESTY BOUNDARY for every
 * console replica in apps/web (TASK K / the roadmap's "no fake live data"
 * control).
 *
 * This is a SERVER component. It renders a zinc-950 surface with mac-style
 * browser-chrome dots and an optional caption (matching apps/console's
 * dark-chrome aesthetic), and — crucially — ALWAYS shows the standing label
 * "Illustrative replica of the operator console · sample data". That label is a
 * reviewed security control, not styling: every replica MUST wrap in this
 * component so a viewer can never mistake committed sample fixtures for a live
 * operator surface. Do not make the label conditional or removable.
 *
 * apps/web reads no DATABASE_URL/REDIS_URL/admin tokens and fetches no
 * /api/admin/* or SSE endpoint; the children are prop-driven, committed sample
 * data only.
 */
export function ConsoleChrome({ caption, children, className }: ConsoleChromeProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-console-edge bg-console-canvas text-console-ink shadow-2xl",
        className,
      )}
    >
      {/* Standing honesty label — never conditional. */}
      <p
        data-testid="console-replica-label"
        className="border-b border-console-edge bg-console-panel px-4 py-1.5 text-center text-[10px] uppercase tracking-section text-console-muted"
      >
        Illustrative replica of the operator console · sample data
      </p>

      {/* Mac-style browser chrome: traffic-light dots + optional caption. */}
      <div className="flex items-center gap-1.5 border-b border-console-edge bg-console-panel px-4 py-2.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        {caption ? (
          <span className="ml-3 truncate text-[10px] uppercase tracking-section text-console-faint">
            {caption}
          </span>
        ) : null}
      </div>

      {/* Replica body. */}
      <div className="p-4">{children}</div>
    </div>
  );
}
