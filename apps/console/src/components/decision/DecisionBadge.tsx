import type { DecisionKind } from "@adjudicate/core";
import { decisionTheme } from "@/lib/decision-theme";
import { cn } from "@/lib/cn";

export function DecisionBadge({
  kind,
  showSummary = false,
  className,
}: {
  kind: DecisionKind;
  /** Append the Allow/Block/Hold/Modify summary group as a faint suffix. */
  showSummary?: boolean;
  className?: string;
}) {
  const t = decisionTheme[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        t.bg,
        t.fg,
        t.border,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {t.label}
      {showSummary && <span className="text-faint">· {t.summary}</span>}
    </span>
  );
}
