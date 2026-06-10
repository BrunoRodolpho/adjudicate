import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { TRANSPARENCY_SIGNALS } from "@/content/transparency";
import { BrandGlow } from "@/components/ui/BrandGlow";

/**
 * Shared chrome for every /transparency sub-view, so the cluster reads as one
 * designed surface instead of eight bespoke documents:
 *   1. a strong, scale-driven header (eyebrow → H1 → lead);
 *   2. a tonal hero band that frames the page's ONE key metric as the focal
 *      point (passed as `hero` — usually a <TransparencyMetric/>);
 *   3. a de-containerized "what this shows / does not show" disclosure (a left
 *      accent rule + prose, no bordered boxes);
 *   4. a closing "other public signals" nav so a page never ends in a void and
 *      the cluster cross-links.
 * Server component.
 */
export function TransparencyLayout({
  slug,
  eyebrow,
  title,
  lead,
  hero,
  shows,
  notShown,
  footnote,
}: {
  /** Current signal slug — excluded from the closing nav. */
  readonly slug: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly hero: ReactNode;
  readonly shows: ReactNode;
  readonly notShown: ReactNode;
  readonly footnote?: ReactNode;
}) {
  const others = TRANSPARENCY_SIGNALS.filter((s) => s.slug !== slug);
  return (
    <main>
      {/* Header */}
      <header className="bg-canvas pb-8 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/transparency"
            className="inline-flex items-center gap-1.5 rounded-sm text-eyebrow uppercase text-muted transition-colors hover:text-ink focus-ring"
          >
            <ArrowLeft size={12} aria-hidden="true" /> Back to transparency
          </Link>
          <p className="mt-6 text-eyebrow uppercase text-muted">
            Public · transparency · {eyebrow}
          </p>
          <h1 className="mt-2 text-h1 text-ink md:text-h1-lg">{title}</h1>
          <p className="mt-3 max-w-measure text-lead text-muted">{lead}</p>
        </div>
      </header>

      {/* Hero metric band — tonal surface, the page's focal point. */}
      <section
        aria-label="Current signal"
        className="relative overflow-hidden border-y border-edge bg-surface py-14"
      >
        <BrandGlow />
        <div className="relative z-10 mx-auto max-w-6xl px-6">{hero}</div>
      </section>

      {/* What this shows / does not show — de-containerized disclosure. */}
      <section className="bg-canvas py-12">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-6 md:grid-cols-2">
          <div className="border-l-2 border-execute/40 pl-4">
            <h2 className="text-eyebrow uppercase text-execute-strong">
              What this shows
            </h2>
            <div className="mt-2 text-body-sm leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-ink">
              {shows}
            </div>
          </div>
          <div className="border-l-2 border-edge-strong pl-4">
            <h2 className="text-eyebrow uppercase text-muted-strong">
              What this does not show
            </h2>
            <div className="mt-2 text-body-sm leading-relaxed text-muted [&_strong]:font-medium [&_strong]:text-ink">
              {notShown}
            </div>
          </div>
        </div>
        {footnote ? (
          <div className="mx-auto mt-8 max-w-6xl px-6">
            <p className="text-meta text-muted">{footnote}</p>
          </div>
        ) : null}
      </section>

      {/* Closing — other public signals. Kills the trailing void + cross-links. */}
      <section className="border-t border-edge bg-surface py-14">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-eyebrow uppercase text-muted">
            Other public signals
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/transparency/${s.slug}`}
                  className="group flex h-full min-w-0 flex-col gap-1 rounded-xl bg-canvas p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-sm focus-ring"
                >
                  <span className="flex items-center justify-between gap-2 text-body-sm font-medium text-ink">
                    {s.label}
                    <ArrowUpRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                    />
                  </span>
                  <span className="text-meta text-muted">{s.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
