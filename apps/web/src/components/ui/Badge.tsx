import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "shipped" | "roadmap" | "adr";

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: "border-console-edge bg-console-panel text-console-muted",
  shipped: "border-execute/40 bg-execute/10 text-execute",
  roadmap: "border-defer/40 bg-defer/10 text-defer",
  adr: "border-escalate/40 bg-escalate/10 text-escalate",
};

/**
 * Small status pill. Server component.
 */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-section",
        TONE_STYLES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
