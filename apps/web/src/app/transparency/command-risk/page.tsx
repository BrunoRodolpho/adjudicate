import type { Metadata } from "next";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import { projectCommandRiskTransparency } from "@/lib/command-risk-transparency";
import { COMMAND_RISK_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import {
  AnimatedBarRows,
  type BarRow,
} from "@/components/transparency/AnimatedBarRows";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";

export const metadata: Metadata = {
  title: "Command risk · Transparency · adjudicate",
  description:
    "Public, aggregates-only distribution of classified command risk by category (destructive / network / credential / safe). Illustrative sample data with a small-cohort floor — never command text or rule ids.",
};

/**
 * /transparency/command-risk — public, aggregates-only command-risk view
 * (ADR-134). A category distribution only — never command text, rule id,
 * disposition split, timestamp, or tenant datum.
 */
export default function CommandRiskTransparencyPage() {
  const buckets = projectCommandRiskTransparency(COMMAND_RISK_TRANSPARENCY_SAMPLE);
  const maxValue = buckets.reduce((m, b) => Math.max(m, b.value), 0);

  const rows: BarRow[] = buckets.map((bucket) => ({
    key: bucket.category,
    widthPct:
      maxValue > 0
        ? Math.max(bucket.value > 0 ? 2 : 0, Math.round((bucket.value / maxValue) * 100))
        : 0,
    display: bucket.display,
    censored: bucket.censored,
    leading: (
      <th scope="row" className="px-4 py-3 font-medium text-ink">
        {bucket.categoryLabel}
      </th>
    ),
  }));

  return (
    <TransparencyLayout
      slug="command-risk"
      eyebrow="command risk"
      title="See what we refuse in the wild."
      lead="Every command an agent proposes is classified by risk — destructive, network, credential, or safe. This view is the aggregate shape of that risk: how much of what your agents attempt is dangerous enough to need guarding. Counts only — never the commands themselves or the rules they tripped."
      hero={
        <div>
          <h2 className="text-eyebrow uppercase text-muted">
            Risk distribution by category
          </h2>
          <div className="mt-4 overflow-x-auto rounded-sm">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Illustrative aggregate counts of classified command risk by
                category. Counts below {PUBLIC_COHORT_FLOOR} are shown as
                &ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;.
              </caption>
              <thead>
                <tr className="border-b border-edge">
                  <th scope="col" className="px-4 py-2.5 text-eyebrow uppercase text-muted">
                    Category
                  </th>
                  <th scope="col" className="w-1/2 px-4 py-2.5 text-eyebrow uppercase text-muted">
                    Count
                  </th>
                </tr>
              </thead>
              <AnimatedBarRows rows={rows} floor={PUBLIC_COHORT_FLOOR} />
            </table>
          </div>
          <p className="mt-4 text-meta text-muted">
            Bars are scaled to the largest visible cohort; censored cohorts
            (&ldquo;&lt;{PUBLIC_COHORT_FLOOR}&rdquo;) are floored. Safe commands
            produce no audit basis, so their public count is always 0.
          </p>
        </div>
      }
      shows={
        <p>
          Each command is classified into a closed-enum risk category, projected
          through the public privacy contract. Read it as the{" "}
          <strong>shape of attempted risk</strong>: a deployment with a fat{" "}
          <strong>destructive</strong> or <strong>credential</strong> band is one
          where the guards are earning their keep.
        </p>
      }
      notShown={
        <p>
          The actual <strong>command text</strong> and the rules it tripped are{" "}
          <strong>never</strong> exposed — neither is the blocked / rewritten /
          confirm split, which could telegraph an attack in progress. Figures are
          illustrative sample data, not live production numbers.
        </p>
      }
    />
  );
}
