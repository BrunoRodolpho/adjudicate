import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandGlow } from "@/components/ui/BrandGlow";

/**
 * Reusable depth-page header. Matches the markup the depth routes
 * (e.g. /architecture) already use: a back link above an eyebrow + title +
 * subtitle block. Server component.
 */
export function DepthHeader({
  eyebrow,
  title,
  subtitle,
  backHref = "/",
  backLabel = "Back to home",
  className,
}: {
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly subtitle?: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly className?: string;
}) {
  return (
    <header className={cn("relative overflow-hidden bg-canvas pb-6 pt-10", className)}>
      <BrandGlow />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden="true" /> {backLabel}
        </Link>
        {eyebrow ? (
          <p className="mt-6 text-eyebrow uppercase text-muted">{eyebrow}</p>
        ) : null}
        {/* Page H1 sits a full tier above section H2 (36/48 vs 30/36) so the
            hierarchy never collapses mid-scroll. */}
        <h1 className="mt-2 text-h1 text-ink md:text-h1-lg">{title}</h1>
        {subtitle ? (
          <p className="mt-3 max-w-measure text-lead text-muted">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
