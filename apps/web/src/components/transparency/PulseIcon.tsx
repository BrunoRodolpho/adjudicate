import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * PulseIcon — a status icon that gently pulses its opacity on a slow loop to
 * draw the eye when, and only when, something needs attention (e.g. an elevated
 * drift severity or a "storm" stability class).
 *
 * `pulse` is the caller's "is this urgent?" decision; when false the icon
 * renders flat. The pulse is CSS-only (`motion-safe:animate-pulse`) so this is a
 * SERVER component — it can accept a `LucideIcon` component prop directly from
 * server parents (a function prop can't cross the RSC boundary into a client
 * component). Reduced-motion-safe: `motion-safe:` means no animation under
 * `prefers-reduced-motion`, so urgency is still carried by the icon + colour +
 * text label, never by motion alone. Opacity-only — no transform, no layout
 * shift.
 */
export function PulseIcon({
  icon: Icon,
  size = 28,
  className,
  pulse,
}: {
  readonly icon: LucideIcon;
  readonly size?: number;
  readonly className?: string;
  /** When true (and motion is allowed), the icon pulses to signal urgency. */
  readonly pulse: boolean;
  /** Retained for API compatibility; the CSS pulse uses a fixed cadence. */
  readonly durationSec?: number;
}) {
  return (
    <Icon
      size={size}
      aria-hidden
      className={cn("shrink-0", pulse && "motion-safe:animate-pulse", className)}
    />
  );
}
