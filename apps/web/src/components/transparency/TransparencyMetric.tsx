import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type MetricTone = "ok" | "warn" | "crit" | "neutral";

const TONE: Record<MetricTone, { value: string; badge: string }> = {
  ok: { value: "text-execute", badge: "border-execute/40 bg-execute/10 text-execute" },
  warn: { value: "text-defer", badge: "border-defer/40 bg-defer/10 text-defer" },
  crit: { value: "text-refuse", badge: "border-refuse/40 bg-refuse/10 text-refuse" },
  neutral: { value: "text-console-ink", badge: "border-console-edge bg-console-canvas text-console-muted" },
};

/**
 * The hero metric for a transparency sub-view — the single number the page is
 * about, rendered large and confident as the focal point (the prior pages
 * buried it in a small bordered card). A big tabular-nums value + unit + an
 * optional status badge on the left; an optional supporting visual (a bar, a
 * strip) on the right.
 */
export function TransparencyMetric({
  label,
  value,
  unit,
  tone = "neutral",
  status,
  detail,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly tone?: MetricTone;
  readonly status?: string;
  /** Small line under the value (e.g. "5 of 5 reference packs verify"). */
  readonly detail?: string;
  /** Supporting visual on the right (bar, strip, mini-chart). */
  readonly children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-eyebrow uppercase text-console-muted">{label}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={cn(
              "font-mono text-[3.5rem] font-semibold leading-none tracking-tight tabular-nums md:text-[4.5rem]",
              t.value,
            )}
          >
            {value}
          </span>
          {unit ? (
            <span className="text-h3 font-semibold text-console-muted">{unit}</span>
          ) : null}
        </div>
        {detail ? <p className="mt-3 text-body text-console-muted">{detail}</p> : null}
        {status ? (
          <span
            className={cn(
              "mt-4 inline-flex items-center rounded-full border px-2.5 py-0.5 text-eyebrow uppercase",
              t.badge,
            )}
          >
            {status}
          </span>
        ) : null}
      </div>
      {children ? <div className="w-full min-w-0 md:max-w-md">{children}</div> : null}
    </div>
  );
}
