import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import { projectPiiTransparency } from "@/lib/pii-transparency";
import { PII_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { Reveal } from "@/components/home/Reveal";
import {
  AnimatedBarRows,
  type BarRow,
} from "@/components/transparency/AnimatedBarRows";

export const metadata: Metadata = {
  title: "PII handling · Transparency · adjudicate",
  description:
    "Public, aggregates-only view of how sensitive fields are redacted or blocked by sensitivity class. Illustrative sample data with a small-cohort floor — never raw PII values.",
};

/**
 * /transparency/pii — public, aggregates-only PII handling view (ADR-128).
 *
 * Server component. apps/web is public and has no database credentials, so this
 * renders from a committed ILLUSTRATIVE fixture, projected through the public
 * cohort-floor contract. It shows only (sensitivity × disposition) counts —
 * censored to "<5" below the floor — and NEVER any raw value, field, or hash.
 */
export default function PiiTransparencyPage() {
  const buckets = projectPiiTransparency(PII_TRANSPARENCY_SAMPLE);
  const maxValue = buckets.reduce((m, b) => Math.max(m, b.value), 0);

  const rows: BarRow[] = buckets.map((bucket) => {
    const widthPct =
      maxValue > 0
        ? Math.max(2, Math.round((bucket.value / maxValue) * 100))
        : 0;
    return {
      key: `${bucket.sensitivityLevel}-${bucket.disposition}`,
      widthPct,
      display: bucket.display,
      censored: bucket.censored,
      leading: (
        <>
          <th scope="row" className="px-4 py-3 font-medium text-ink">
            {bucket.sensitivityLabel}
          </th>
          <td className="px-4 py-3 text-muted">{bucket.dispositionLabel}</td>
        </>
      ),
    };
  });

  return (
    <main>
      <header className="bg-canvas pb-6 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/transparency"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> Back to transparency
          </Link>
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            Public · transparency · PII handling
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            See how sensitive data is contained.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Sensitive fields are never refused wholesale — they can only be{" "}
            <span className="text-ink">redacted</span> or{" "}
            <span className="text-ink">blocked</span>. This view shows how often
            each sensitivity class takes each path, so you can see the guard is
            actually containing data instead of just logging it after the fact.
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Concrete example: when a user asks for a refund, an email address in
            the request is redacted before it reaches a downstream tool — keeping
            a phishing-grade identifier out of side-effects. The counts below are
            the aggregate of those decisions, by class, never the values
            themselves.
          </p>
        </div>
      </header>

      <section aria-labelledby="note-heading" className="bg-canvas pb-8">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="note-heading" className="sr-only">
            About this data
          </h2>
          <div className="max-w-3xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              Illustrative sample · aggregates only
            </p>
            <p className="mt-2 text-sm text-muted">
              The figures below are{" "}
              <span className="text-ink">illustrative sample data</span>, not live
              production numbers. They are <span className="text-ink">aggregate
              counts only</span> — closed-enum sensitivity classes and
              dispositions — projected through the public privacy contract. Any
              non-zero count below {PUBLIC_COHORT_FLOOR} is shown as{" "}
              <code className="text-ink">&lt;{PUBLIC_COHORT_FLOOR}</code> by the
              small-cohort floor, so a low-volume deployment can&apos;t be
              de-anonymized. No raw PII values, field names, or hashes ever appear
              here.
            </p>
          </div>
        </div>
      </section>

      <Reveal>
        <section aria-labelledby="table-heading" className="bg-canvas pb-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2
              id="table-heading"
              className="text-xs uppercase tracking-section text-muted"
            >
              Handlings by sensitivity and disposition
            </h2>

            <div className="mt-4 overflow-hidden rounded-sm border border-edge bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Illustrative aggregate counts of PII handlings by sensitivity
                  class and disposition. Counts below {PUBLIC_COHORT_FLOOR} are
                  shown as &ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;.
                </caption>
                <thead>
                  <tr className="border-b border-edge">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-xs font-medium uppercase tracking-section text-muted"
                    >
                      Sensitivity
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-xs font-medium uppercase tracking-section text-muted"
                    >
                      Disposition
                    </th>
                    <th
                      scope="col"
                      className="w-1/2 px-4 py-2.5 text-xs font-medium uppercase tracking-section text-muted"
                    >
                      Count
                    </th>
                  </tr>
                </thead>
                <AnimatedBarRows rows={rows} floor={PUBLIC_COHORT_FLOOR} />
              </table>
            </div>

            <p className="mt-4 text-xs text-faint">
              Bars are scaled to the largest visible cohort and are for relative
              comparison only; censored cohorts (&ldquo;&lt;
              {PUBLIC_COHORT_FLOOR}&rdquo;) are floored so they never reveal an
              exact small value.
            </p>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
