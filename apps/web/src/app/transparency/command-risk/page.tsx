import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import { projectCommandRiskTransparency } from "@/lib/command-risk-transparency";
import { COMMAND_RISK_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { Reveal } from "@/components/home/Reveal";
import {
  AnimatedBarRows,
  type BarRow,
} from "@/components/transparency/AnimatedBarRows";

export const metadata: Metadata = {
  title: "Command risk · Transparency · adjudicate",
  description:
    "Public, aggregates-only distribution of classified command risk by category (destructive / network / credential / safe). Illustrative sample data with a small-cohort floor — never command text or rule ids.",
};

/**
 * /transparency/command-risk — public, aggregates-only command-risk view
 * (ADR-134).
 *
 * Server component. apps/web is public and has no database credentials, so this
 * renders from a committed ILLUSTRATIVE fixture, projected through the public
 * cohort-floor contract. It shows ONLY a category distribution (destructive /
 * network / credential / safe) — censored to "<5" below the floor — and NEVER
 * any command text, rule id, disposition split, timestamp, or tenant datum.
 * Redaction is by construction: the public bucket shape carries only `category`
 * and a censored count.
 */
export default function CommandRiskTransparencyPage() {
  const buckets = projectCommandRiskTransparency(COMMAND_RISK_TRANSPARENCY_SAMPLE);
  const maxValue = buckets.reduce((m, b) => Math.max(m, b.value), 0);

  const rows: BarRow[] = buckets.map((bucket) => {
    const widthPct =
      maxValue > 0
        ? Math.max(
            bucket.value > 0 ? 2 : 0,
            Math.round((bucket.value / maxValue) * 100),
          )
        : 0;
    return {
      key: bucket.category,
      widthPct,
      display: bucket.display,
      censored: bucket.censored,
      leading: (
        <th scope="row" className="px-4 py-3 font-medium text-ink">
          {bucket.categoryLabel}
        </th>
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
            Public · transparency · command risk
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            See what we refuse in the wild.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Every command an agent proposes is classified by risk —{" "}
            <span className="text-ink">destructive</span>,{" "}
            <span className="text-ink">network</span>,{" "}
            <span className="text-ink">credential</span>, or{" "}
            <span className="text-ink">safe</span>. This view is the aggregate
            shape of that risk: how much of what your agents attempt is dangerous
            enough to need guarding. Counts only — never the commands themselves
            or the rules they tripped.
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
              production numbers. They are a{" "}
              <span className="text-ink">category distribution only</span> —
              closed-enum risk categories — projected through the public privacy
              contract. Any non-zero count below {PUBLIC_COHORT_FLOOR} is shown as{" "}
              <code className="text-ink">&lt;{PUBLIC_COHORT_FLOOR}</code> by the
              small-cohort floor, so a low-volume deployment can&apos;t be
              de-anonymized. The actual command text and the rules it tripped are{" "}
              <span className="text-ink">never</span> exposed here — neither is the
              blocked / rewritten / confirm split, which could telegraph an attack
              in progress.
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
              Risk distribution by category
            </h2>

            <div className="mt-4 overflow-hidden rounded-sm border border-edge bg-surface">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Illustrative aggregate counts of classified command risk by
                  category. Counts below {PUBLIC_COHORT_FLOOR} are shown as
                  &ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;.
                </caption>
                <thead>
                  <tr className="border-b border-edge">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-xs font-medium uppercase tracking-section text-muted"
                    >
                      Category
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

            <p className="mt-4 text-xs text-muted">
              Bars are scaled to the largest visible cohort and are for relative
              comparison only; censored cohorts (&ldquo;&lt;
              {PUBLIC_COHORT_FLOOR}&rdquo;) are floored so they never reveal an
              exact small value. Safe commands produce no audit basis, so their
              public count is always 0.
            </p>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
