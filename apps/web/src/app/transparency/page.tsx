import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/sections/FinalCTA";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";

export const metadata: Metadata = {
  title: "Transparency · adjudicate",
  description:
    "Public, aggregates-only governance transparency: drift, red-team defenses, PII handling, command risk, configuration integrity, and AI bills-of-materials for the reference packs.",
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
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_VIEWS.map((v) => {
              const body = (
                <>
                  <h3 className="text-sm font-medium text-ink">{v.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {v.exposes}
                  </p>
                  {v.href ? (
                    <p className="mt-2 text-xs uppercase tracking-section text-ink">
                      View →
                    </p>
                  ) : null}
                </>
              );
              return (
                <li key={v.title}>
                  {v.href ? (
                    <Link
                      href={v.href}
                      className="flex h-full flex-col rounded-sm border border-edge bg-surface p-4 transition-colors hover:border-ink/30"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex h-full flex-col rounded-sm border border-edge bg-surface p-4">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-faint">
            Operator-only surfaces — the Approval Center and the live audit tail —
            are never published here; they require authenticated console access.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

interface PublicView {
  readonly title: string;
  readonly exposes: string;
  /** Live public route, when one ships. Cards without an href are placeholders. */
  readonly href?: string;
}

const PUBLIC_VIEWS: readonly PublicView[] = [
  {
    title: "PII handling",
    href: "/transparency/pii",
    exposes:
      "How often sensitive fields are redacted or blocked, by sensitivity class — counts only, never the values themselves.",
  },
  {
    title: "AI bill-of-materials",
    href: "/transparency/ai-bom",
    exposes:
      "Models, tools, vector stores, prompt hashes, and conformance for each reference pack (EU AI Act / NIST AI RMF aligned).",
  },
  {
    title: "Behavioral drift",
    href: "/transparency/drift",
    exposes:
      "Whether decision distributions are shifting, by severity and dimension — a status summary, not the underlying records.",
  },
  {
    title: "Red-team defenses",
    href: "/transparency/red-team",
    exposes:
      "Whether each shipped pack still defends against the adversarial suite — a clean/regressed badge with defended totals.",
  },
  {
    title: "Command risk",
    exposes:
      "The distribution of classified command risk (destructive / network / credential / safe) — categories and counts only.",
  },
  {
    title: "Configuration integrity",
    href: "/transparency/integrity",
    exposes:
      "Whether pack configuration seals verify and the kill-switch stability class — no digests, reasons, or actors.",
  },
];
