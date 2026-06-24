import type { Metadata } from "next";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import { projectPiiTransparency } from "@/lib/pii-transparency";
import { PII_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import {
  AnimatedBarRows,
  type BarRow,
} from "@/components/transparency/AnimatedBarRows";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";

export const metadata: Metadata = {
  title: "PII handling · Transparency · adjudicate",
  description:
    "Public, aggregates-only view of how sensitive fields are redacted or blocked by sensitivity class. Illustrative sample data with a small-cohort floor — never raw PII values.",
};

/**
 * /transparency/pii — public, aggregates-only PII handling view (ADR-128).
 * Only (sensitivity × disposition) counts — censored to "<5" below the cohort
 * floor — never any raw value, field, or hash.
 */
export default function PiiTransparencyPage() {
  const buckets = projectPiiTransparency(PII_TRANSPARENCY_SAMPLE);
  const maxValue = buckets.reduce((m, b) => Math.max(m, b.value), 0);

  const rows: BarRow[] = buckets.map((bucket) => ({
    key: `${bucket.sensitivityLevel}-${bucket.disposition}`,
    widthPct: maxValue > 0 ? Math.max(2, Math.round((bucket.value / maxValue) * 100)) : 0,
    display: bucket.display,
    censored: bucket.censored,
    // On-brand semantic colour: a blocked field maps to REFUSE, a redacted one
    // to REWRITE — the same decision vocabulary the rest of the site uses.
    tone: bucket.disposition === "blocked" ? "bg-refuse/70" : "bg-rewrite/70",
    leading: (
      <>
        <th scope="row" className="px-4 py-3 font-medium text-console-ink">
          {bucket.sensitivityLabel}
        </th>
        <td className="px-4 py-3 text-console-muted">{bucket.dispositionLabel}</td>
      </>
    ),
  }));

  return (
    <TransparencyLayout
      slug="pii"
      eyebrow="PII handling"
      title="See how sensitive data is contained."
      lead="Sensitive fields are never refused wholesale — they can only be redacted or blocked. This view shows how often each sensitivity class takes each path, so you can see the guard is actually containing data, not just logging it after the fact."
      hero={
        <div>
          <h2 className="text-eyebrow uppercase text-console-muted">
            Handlings by sensitivity &amp; disposition
          </h2>
          <div className="mt-4 overflow-x-auto rounded-sm">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Illustrative aggregate counts of PII handlings by sensitivity
                class and disposition. Counts below {PUBLIC_COHORT_FLOOR} are
                shown as &ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;.
              </caption>
              <thead>
                <tr className="border-b border-console-edge">
                  <th scope="col" className="px-4 py-2.5 text-eyebrow uppercase text-console-muted">
                    Sensitivity
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-eyebrow uppercase text-console-muted">
                    Disposition
                  </th>
                  <th scope="col" className="w-1/2 px-4 py-2.5 text-eyebrow uppercase text-console-muted">
                    Count
                  </th>
                </tr>
              </thead>
              <AnimatedBarRows rows={rows} floor={PUBLIC_COHORT_FLOOR} />
            </table>
          </div>
          <p className="mt-4 text-meta text-console-muted">
            Bars are scaled to the largest visible cohort for relative comparison
            only; censored cohorts (&ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;) are
            floored so they never reveal an exact small value.
          </p>
        </div>
      }
      shows={
        <>
          <p>
            Concrete example: when a user asks for a refund, an email address in
            the request is <strong>redacted before it reaches a downstream
            tool</strong> — keeping a phishing-grade identifier out of
            side-effects. The counts are the aggregate of those decisions, by
            class, never the values themselves.
          </p>
          <p className="mt-2 text-meta">
            Any non-zero count below {PUBLIC_COHORT_FLOOR} is shown as{" "}
            <code>&lt;{PUBLIC_COHORT_FLOOR}</code> by the small-cohort floor, so a
            low-volume deployment can&apos;t be de-anonymized.
          </p>
        </>
      }
      notShown={
        <p>
          The figures are <strong>illustrative sample data</strong>, not live
          production numbers — aggregate counts of closed-enum sensitivity
          classes and dispositions only. No <strong>raw PII values, field
          names, or hashes</strong> ever appear here.
        </p>
      }
    />
  );
}
