import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "shipped" | "roadmap" | "adr";

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: "border-edge bg-surface text-muted",
  shipped: "border-execute/40 bg-execute/10 text-execute-strong",
  roadmap: "border-defer/40 bg-defer/10 text-defer-strong",
  adr: "border-escalate/40 bg-escalate/10 text-escalate-strong",
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
