import { CountUp } from "@/components/motion/CountUp";
import { cn } from "@/lib/cn";

/**
 * A single headline statistic: large mono value, label, optional hint.
 *
 * Numeric values animate from 0 → value on scroll-into-view via {@link CountUp}
 * (a client component); string values (e.g. the "✓" guarantees) render
 * statically. Reduced-motion is handled inside CountUp — the final value shows
 * immediately. Server component; CountUp is the only client island it mounts.
 */
export function StatTile({
  value,
  label,
  hint,
  className,
}: {
  readonly value: string | number;
  readonly label: string;
  readonly hint?: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-mono-stat leading-none tabular-nums text-console-ink md:text-mono-stat-lg">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </span>
      <span className="text-sm font-medium text-console-ink">{label}</span>
      {hint ? (
        <span className="text-xs leading-relaxed text-console-muted">{hint}</span>
      ) : null}
    </div>
  );
}
