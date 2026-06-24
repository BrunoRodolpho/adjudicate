import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CalloutTone = "info" | "warn";

const TONE_STYLES: Record<
  CalloutTone,
  { container: string; icon: typeof Info; iconColor: string; title: string }
> = {
  info: {
    container: "border-confirm/30 bg-confirm/5",
    icon: Info,
    iconColor: "text-confirm",
    title: "text-console-ink",
  },
  warn: {
    container: "border-defer/40 bg-defer/5",
    icon: TriangleAlert,
    iconColor: "text-defer",
    title: "text-console-ink",
  },
};

/**
 * Bordered note block with a leading icon. Server component.
 */
export function Callout({
  children,
  tone = "info",
  title,
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: CalloutTone;
  readonly title?: string;
  readonly className?: string;
}) {
  const t = TONE_STYLES[tone];
  const Icon = t.icon;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4",
        t.container,
        className,
      )}
    >
      <Icon
        size={18}
        className={cn("mt-0.5 shrink-0", t.iconColor)}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1">
        {title ? (
          <p className={cn("text-sm font-semibold", t.title)}>{title}</p>
        ) : null}
        <div className="text-sm leading-relaxed text-console-muted">{children}</div>
      </div>
    </div>
  );
}
