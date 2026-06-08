import { cn } from "@/lib/cn";

/**
 * A single headline statistic: large mono value, label, optional hint.
 * Server component.
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
      <span className="font-mono text-3xl font-semibold tracking-tight text-ink md:text-4xl">
        {value}
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint ? (
        <span className="text-xs leading-relaxed text-muted">{hint}</span>
      ) : null}
    </div>
  );
}
