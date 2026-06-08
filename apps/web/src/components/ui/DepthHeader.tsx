import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

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
  readonly title: string;
  readonly subtitle?: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly className?: string;
}) {
  return (
    <header className={cn("bg-canvas pb-6 pt-10", className)}>
      <div className="mx-auto max-w-6xl px-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden="true" /> {backLabel}
        </Link>
        {eyebrow ? (
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 max-w-2xl text-base text-muted">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
