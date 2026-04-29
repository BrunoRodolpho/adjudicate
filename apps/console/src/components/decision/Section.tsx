import { ChevronDown } from "lucide-react";

/**
 * Collapsible section primitive used across the DecisionTrace.
 *
 * <details>/<summary> for zero-JS collapsibility — the raw HTML widget styled
 * to feel like an IDE outline tree. The chevron rotates 90° when open via
 * `group-open:` Tailwind variant.
 */
export function Section({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-t border-edge first:border-t-0"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-1.5 hover:bg-edge/30">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-section text-muted group-open:text-ink">
          <ChevronDown
            size={11}
            className="-rotate-90 transition-transform group-open:rotate-0"
          />
          {title}
        </span>
        {badge}
      </summary>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}
