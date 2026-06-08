import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Coming soon" placeholder. Centred, muted, dashed-border card. Uses
 * tone-neutral colours (current* / opacity) so it reads on both the light
 * canvas and the dark console background. Server component.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = Sparkles,
  className,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly icon?: LucideIcon;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-current/20 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-current/5 text-current/60">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-current/90">{title}</p>
      {hint ? (
        <p className="max-w-sm text-sm leading-relaxed text-current/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
