import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldAlert,
  Activity,
  FileCheck2,
  EyeOff,
  Terminal,
  Coins,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import {
  RevealGrid,
  RevealGridItem,
} from "@/components/transparency/RevealGrid";

export const metadata: Metadata = {
  title: "Transparency · adjudicate",
  description:
    "Public, aggregates-only governance transparency: drift, red-team defenses, PII handling, command risk, configuration integrity, and AI bills-of-materials for the reference packs.",
  openGraph: {
    title: "Transparency · adjudicate",
    description:
      "Public, aggregates-only governance transparency: drift, red-team defenses, PII handling, command risk, configuration integrity, and AI bills-of-materials for the reference packs.",
    type: "website",
    images: [{ url: "/og-transparency.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-transparency.png"],
  },
};

/**
 * /transparency — the public, read-only governance surface (dual-app strategy,
 * ADR-128). Unlike the operator console (apps/console), this is unauthenticated
 * and exposes AGGREGATES ONLY, projected through an allowlist with a small-cohort
 * floor so nothing here can leak raw PII, commands, prompts, tokens, ids, or
 * individual decisions. Per-surface views (fed by app-local /api/transparency/*
 * routes) come online as each governance surface ships.
 */
export default function TransparencyPage() {
  return (
    <main>
      <header className="bg-canvas pb-6 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> Back to homepage
          </Link>
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            Public · transparency
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            Governance in the open.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            The same governance signals operators see in the console — published
            as public, aggregates-only summaries. No raw data ever crosses this
            boundary.
          </p>
        </div>
      </header>

      <section
        aria-labelledby="contract-heading"
        className="bg-canvas pb-10"
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2
            id="contract-heading"
            className="text-xs uppercase tracking-section text-muted"
          >
            The privacy contract
          </h2>
          <ul className="mt-3 grid max-w-3xl gap-2 text-sm text-muted">
            <li>
              <span className="text-ink">Aggregates only.</span> Counts, ratios,
              closed-enum categories, coarse time buckets, pack versions, and BOM
              hashes — never raw PII, command text, prompts, tokens, session/tenant
              ids, intent hashes, actors, or individual decisions.
            </li>
            <li>
              <span className="text-ink">Small-cohort floor.</span> Any non-zero
              count below {PUBLIC_COHORT_FLOOR} is shown as{" "}
              <code className="text-ink">&lt;{PUBLIC_COHORT_FLOOR}</code>, so a
              low-volume deployment can&apos;t be de-anonymized from a public page.
            </li>
            <li>
              <span className="text-ink">Allowlist by construction.</span> Public
              views are built field-by-field from an explicit projection; the
              operator console&apos;s authenticated API is never exposed here.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="views-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            id="views-heading"
            className="text-xs uppercase tracking-section text-muted"
          >
            Public views
          </h2>

          {VIEW_GROUPS.map((group) => (
            <div key={group.title} className="mt-8 first:mt-4">
              <h3 className="text-sm font-medium text-ink">{group.title}</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
                {group.blurb}
              </p>
              <RevealGrid className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.views.map((v) => (
                  <ViewCard key={v.title} view={v} />
                ))}
              </RevealGrid>
            </div>
          ))}

          <p className="mt-8 text-xs text-muted">
            Operator-only surfaces — the Approval Center and the live audit tail —
            are never published here; they require authenticated console access.
          </p>
        </div>
      </section>
    </main>
  );
}

function ViewCard({ view }: { readonly view: PublicView }) {
  const Icon = view.icon;
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <Icon
          size={18}
          aria-hidden
          className="shrink-0 text-muted transition-colors group-hover:text-ink"
        />
        <h4 className="text-sm font-medium text-ink">{view.title}</h4>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{view.exposes}</p>
      {view.href ? (
        <p className="mt-auto pt-3 text-xs uppercase tracking-section text-ink">
          View
          <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </p>
      ) : null}
    </>
  );
  return (
    <RevealGridItem className="h-full">
      {view.href ? (
        <Link
          href={view.href}
          className="group flex h-full flex-col rounded-sm border border-edge bg-surface p-4 transition-colors hover:border-ink/30 hover:shadow-sm"
        >
          {body}
        </Link>
      ) : (
        <div className="flex h-full flex-col rounded-sm border border-edge bg-surface p-4">
          {body}
        </div>
      )}
    </RevealGridItem>
  );
}

interface PublicView {
  readonly title: string;
  readonly exposes: string;
  readonly icon: LucideIcon;
  /** Live public route, when one ships. Cards without an href are placeholders. */
  readonly href?: string;
}

interface ViewGroup {
  readonly title: string;
  readonly blurb: string;
  readonly views: readonly PublicView[];
}

const VIEW_GROUPS: readonly ViewGroup[] = [
  {
    title: "Risk & compliance",
    blurb:
      "Is the system being attacked, drifting, or tampered with — and can an auditor verify what each pack runs?",
    views: [
      {
        title: "Red-team defenses",
        href: "/transparency/red-team",
        icon: ShieldAlert,
        exposes:
          "Whether each shipped pack still defends against the adversarial suite — a clean/regressed badge with defended totals.",
      },
      {
        title: "Behavioral drift",
        href: "/transparency/drift",
        icon: Activity,
        exposes:
          "Whether decision distributions are shifting, by severity and dimension — a status summary, not the underlying records.",
      },
      {
        title: "Configuration integrity",
        href: "/transparency/integrity",
        icon: FileCheck2,
        exposes:
          "Whether pack configuration seals verify and the kill-switch stability class — no digests, reasons, or actors.",
      },
      {
        title: "AI bill-of-materials",
        href: "/transparency/ai-bom",
        icon: Boxes,
        exposes:
          "Models, tools, vector stores, prompt hashes, and conformance for each reference pack (EU AI Act / NIST AI RMF aligned).",
      },
    ],
  },
  {
    title: "Operations",
    blurb:
      "The day-to-day governance signals — what we contain, what we refuse, and how much budget is left.",
    views: [
      {
        title: "PII handling",
        href: "/transparency/pii",
        icon: EyeOff,
        exposes:
          "How often sensitive fields are redacted or blocked, by sensitivity class — counts only, never the values themselves.",
      },
      {
        title: "Command risk",
        href: "/transparency/command-risk",
        icon: Terminal,
        exposes:
          "The distribution of classified command risk (destructive / network / credential / safe) — categories and counts only.",
      },
      {
        title: "Token governance",
        href: "/transparency/tokens",
        icon: Coins,
        exposes:
          "An aggregate token-budget burn-down — a banded percent of budget used, coarsely rounded. Never session/tenant ids or raw counts.",
      },
    ],
  },
];
