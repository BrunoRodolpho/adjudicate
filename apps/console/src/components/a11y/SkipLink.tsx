import { cn } from "@/lib/cn";

interface Props {
  /**
   * The id of the main landmark to jump to. Defaults to `main-content`; the
   * target element must carry a matching `id` and be focusable (e.g. a
   * `<main id="main-content" tabIndex={-1}>`).
   */
  readonly targetId?: string;
  /** Override the visible label. Defaults to "Skip to main content". */
  readonly children?: string;
  readonly className?: string;
}

/**
 * Skip-link — the first focusable element in the app shell. It stays clipped
 * via `sr-only` until it receives keyboard focus, at which point
 * `focus:not-sr-only` reveals it pinned to the top-left so a keyboard user can
 * bypass the nav and land on the main landmark. Styling reuses existing tokens
 * (panel surface, edge border, ink text) and the same focus-visible ring used
 * across interactive controls.
 */
export function SkipLink({
  targetId = "main-content",
  children = "Skip to main content",
  className,
}: Props) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only",
        "focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50",
        "focus:rounded-sm focus:border focus:border-edge focus:bg-panel",
        "focus:px-3 focus:py-1.5 focus:text-[11px] focus:text-ink",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink",
        className,
      )}
    >
      {children}
    </a>
  );
}
