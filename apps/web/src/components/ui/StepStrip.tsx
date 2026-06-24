import { cn } from "@/lib/cn";

const STEPS = [
  "AI acts",
  "Guard decides",
  "Receipt saved",
  "Console shows",
] as const;

/**
 * The 4-step spine rendered as numbered chips. `active` (1-based) highlights
 * the current step. Server component — the only motion is an opt-in,
 * CSS-only, motion-safe pulse on the active chip (see `pulse`), so this can
 * stay a server component and reduced-motion users see a static highlight.
 *
 * Static callers (capability pages, data-flow) pass no `pulse`, so the strip
 * renders exactly as before. The guided runner sets `pulse` while a step is
 * in flight to signal "the kernel is deciding".
 */
export function StepStrip({
  active,
  pulse = false,
  className,
}: {
  readonly active?: number;
  /**
   * When true, the active chip gently pulses to signal an in-flight step.
   * CSS-only and gated behind `motion-safe:` so reduced-motion is honoured.
   */
  readonly pulse?: boolean;
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
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-300",
                isActive
                  ? "border-transparent bg-gradient-primary text-white shadow-sm"
                  : "border-console-edge bg-console-panel text-console-muted",
                isActive && pulse && "motion-safe:animate-pulse",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full font-mono text-[11px]",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-console-canvas text-console-ink",
                )}
              >
                {step}
              </span>
              {label}
            </span>
            {step < STEPS.length ? (
              <span className="text-console-faint" aria-hidden="true">
                &rarr;
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
