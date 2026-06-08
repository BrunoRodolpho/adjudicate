import { cn } from "@/lib/cn";

const STEPS = [
  "AI acts",
  "Guard decides",
  "Receipt saved",
  "Console shows",
] as const;

/**
 * The 4-step spine rendered as numbered chips. `active` (1-based) highlights
 * the current step. Static — no animation yet. Server component.
 */
export function StepStrip({
  active,
  className,
}: {
  readonly active?: number;
  readonly className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-3",
        className,
      )}
    >
      {STEPS.map((label, idx) => {
        const step = idx + 1;
        const isActive = active === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "border-transparent bg-gradient-primary text-white shadow-sm"
                  : "border-edge bg-surface text-muted",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full font-mono text-[11px]",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-edge text-ink",
                )}
              >
                {step}
              </span>
              {label}
            </span>
            {step < STEPS.length ? (
              <span className="text-faint" aria-hidden="true">
                &rarr;
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
