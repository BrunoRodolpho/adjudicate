import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, FileText, Package } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Badge } from "@/components/ui/Badge";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Callout } from "@/components/ui/Callout";
import { REPO_BASE } from "@/content/primitives";
import { CAPABILITIES, type CapabilityContent } from "@/content/capabilities";
import { CapabilityPageLayout } from "@/components/capabilities/CapabilityPageLayout";

/**
 * /capabilities/[slug] — the per-capability route. One dynamic page renders all
 * 14 entries from the {@link CAPABILITIES} registry:
 *
 *   • Tier 1 → the full {@link CapabilityPageLayout} deep-dive (provenance +
 *     worked example + console/public-data bands).
 *   • Tier 2 → a concise REFERENCE page (header + whatItDoes + provenance links
 *     + a "full page coming soon" callout). Tier 2 does NOT 404 — the entry is
 *     real, only its interactive page is deferred.
 *   • unknown slug → notFound().
 *
 * `generateStaticParams` prebuilds every registry slug, so all 14 are static.
 */

function findCapability(slug: string): CapabilityContent | undefined {
  return CAPABILITIES.find((c) => c.slug === slug);
}

export function generateStaticParams(): Array<{ slug: string }> {
  return CAPABILITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cap = findCapability(slug);
  if (!cap) {
    return { title: "Capability · adjudicate" };
  }
  return {
    title: `${cap.name} · Capabilities · adjudicate`,
    description: cap.oneLiner,
  };
}

export default async function CapabilityPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cap = findCapability(slug);
  if (!cap) notFound();

  if (cap.tier === 1) {
    return <CapabilityPageLayout capability={cap} />;
  }
  return <ReferencePage capability={cap} />;
}

/* ── Tier-2 reference page ─────────────────────────────────────────────── */

function ReferencePage({
  capability,
}: {
  readonly capability: CapabilityContent;
}) {
  const adrHref = `${REPO_BASE}${capability.adr.path}`;
  const sourceHref = `${REPO_BASE}${capability.pkg.sourcePath}`;

  return (
    <main>
      <DepthHeader
        eyebrow="Capability · reference"
        title={capability.name}
        subtitle={capability.oneLiner}
        backHref="/capabilities"
        backLabel="Back to capabilities"
      />

      <Section className="pt-10">
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="adr">{capability.adr.id}</Badge>
              <Badge tone="roadmap">Reference · Tier 2</Badge>
              <Badge tone="neutral">{capability.pkg.name}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {capability.outcomes.map((kind) => (
                <DecisionChip key={kind} kind={kind} size="sm" />
              ))}
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              What it does
            </h2>
            <p className="max-w-3xl text-base leading-relaxed text-muted">
              {capability.whatItDoes}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Provenance
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReferenceLink
                href={adrHref}
                icon={FileText}
                eyebrow="Governing ADR"
                primary={capability.adr.id}
                secondary={capability.adr.path}
              />
              <ReferenceLink
                href={sourceHref}
                icon={Package}
                eyebrow="Implementing package"
                primary={capability.pkg.name}
                secondary={capability.pkg.sourcePath}
              />
            </div>
          </section>

          <Callout tone="info" title="Full interactive page coming soon">
            This capability ships a documented reference entry today. Its full
            interactive page — with a live worked example and the matching
            console surface — arrives in a later phase. The package and ADR
            above are real and verifiable now.
          </Callout>
        </div>
      </Section>
    </main>
  );
}

function ReferenceLink({
  href,
  icon: Icon,
  eyebrow,
  primary,
  secondary,
}: {
  readonly href: string;
  readonly icon: typeof FileText;
  readonly eyebrow: string;
  readonly primary: string;
  readonly secondary: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col gap-2 rounded-xl border border-edge bg-surface p-5 transition-colors hover:border-ink/30"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-section text-muted">
          <Icon size={13} aria-hidden="true" />
          {eyebrow}
        </span>
        <ArrowUpRight
          size={14}
          className="text-faint transition-colors group-hover:text-ink"
          aria-hidden="true"
        />
      </div>
      <code className="text-base font-semibold text-ink">{primary}</code>
      <code className="break-all text-[11px] text-faint">{secondary}</code>
    </a>
  );
}
