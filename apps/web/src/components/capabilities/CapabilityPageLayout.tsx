import { ArrowUpRight, FileText, Package } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Badge } from "@/components/ui/Badge";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { StepStrip } from "@/components/ui/StepStrip";
import { Callout } from "@/components/ui/Callout";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { REPO_BASE } from "@/content/primitives";
import type { CapabilityContent } from "@/content/capabilities";
import { WorkedExample } from "@/components/capabilities/WorkedExample";

/**
 * CapabilityPageLayout — the capability deep-dive page body. Renders ALL 14
 * capabilities (Tier 1 and Tier 2 alike) — `tier` is a maturity marker, not a
 * page-completeness one.
 *
 * SERVER component. Given one {@link CapabilityContent} it renders, top to
 * bottom:
 *
 *   1. DepthHeader (back to /capabilities) — name + one-liner + the ADR /
 *      maturity badges + the outcome chips. The maturity badge reads
 *      `tier` / `interactivity`: a Tier-1 real-kernel page says "Shipped ·
 *      Tier 1"; a Tier-2 fixture-illustrative page says "Illustrative ·
 *      Tier 2" (honest about what its worked example is).
 *   2. A StepStrip anchored on Step 2 ("Guard decides") with a note framing
 *      this capability as what happens at that step.
 *   3. "What it does" — the mechanism-first prose.
 *   4. PROVENANCE — the governing ADR file on GitHub + the implementing
 *      package source file on GitHub (the verifiable-claim convention from
 *      content/primitives.ts: REPO_BASE + repo-relative path).
 *   5. The WORKED EXAMPLE (real kernel, chart, receipt, replica, pack, or
 *      illustration — see {@link WorkedExample}).
 *   6. "How it appears in the console" — a link/illustration to the replica or
 *      transparency route.
 *   7. A "Public data" band linking the matching /transparency projection when
 *      `consoleAppearance.transparencyRoute` is set.
 */
export function CapabilityPageLayout({
  capability,
}: {
  readonly capability: CapabilityContent;
}) {
  const adrHref = `${REPO_BASE}${capability.adr.path}`;
  const sourceHref = `${REPO_BASE}${capability.pkg.sourcePath}`;
  const consoleHref =
    capability.consoleAppearance.replicaRoute ??
    capability.consoleAppearance.transparencyRoute;
  const realKernel = capability.interactivity === "real-kernel";
  const maturityBadge = realKernel
    ? `Shipped · Tier ${capability.tier}`
    : `Illustrative · Tier ${capability.tier}`;

  return (
    <main>
      <DepthHeader
        eyebrow="Capability"
        title={capability.name}
        subtitle={capability.oneLiner}
        backHref="/capabilities"
        backLabel="Back to capabilities"
      />

      <Section className="pt-10">
        {/*
          The body blocks cascade in as the reader scrolls: the outer Stagger
          drives each StaggerItem-wrapped block through revealVariants (fade +
          small rise). Reduced-motion-safe — under prefers-reduced-motion both
          render as plain elements with everything visible at once.
        */}
        <Stagger className="flex flex-col gap-16">
          {/* Badges + outcomes. */}
          <StaggerItem className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="adr">{capability.adr.id}</Badge>
              <Badge tone={realKernel ? "shipped" : "roadmap"}>
                {maturityBadge}
              </Badge>
              <Badge tone="neutral">{capability.pkg.name}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {capability.outcomes.map((kind) => (
                <DecisionChip key={kind} kind={kind} size="sm" />
              ))}
            </div>
          </StaggerItem>

          {/* Step-2 context note. */}
          <StaggerItem className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-6">
            <StepStrip active={2} />
            <p className="text-sm leading-relaxed text-muted">
              This is what happens at{" "}
              <span className="font-medium text-ink">Step 2 — Guard decides</span>{" "}
              for {capability.name.toLowerCase()}: the kernel adjudicates the
              proposed action and disposes it into one of the six outcomes
              above, with a structured basis the receipt carries forward.
            </p>
          </StaggerItem>

          {/* What it does. */}
          <StaggerItem>
            <Block id="what-it-does" title="What it does">
              <p className="max-w-3xl text-base leading-relaxed text-muted">
                {capability.whatItDoes}
              </p>
            </Block>
          </StaggerItem>

          {/* Provenance. */}
          <StaggerItem>
            <Block
              id="provenance"
              title="Provenance"
              subtitle="Every claim on this page resolves to a real ADR and a real source file. These links go straight to the code."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProvenanceCard
                  href={adrHref}
                  icon={FileText}
                  eyebrow="Governing ADR"
                  primary={capability.adr.id}
                  secondary={capability.adr.path}
                />
                <ProvenanceCard
                  href={sourceHref}
                  icon={Package}
                  eyebrow="Implementing package"
                  primary={capability.pkg.name}
                  secondary={capability.pkg.sourcePath}
                />
              </div>
            </Block>
          </StaggerItem>

          {/* Worked example. */}
          <StaggerItem>
            <Block
              id="worked-example"
              title="Worked example"
              subtitle={
                capability.interactivity === "real-kernel"
                  ? "The real kernel, run server-side at render time — not a mock."
                  : "An illustrative example projected from public, aggregate-only sample data."
              }
            >
              <WorkedExample capability={capability} />
            </Block>
          </StaggerItem>

          {/* How it appears in the console. */}
          <StaggerItem>
            <Block
              id="console"
              title="How it appears in the console"
              subtitle="Where an operator sees this capability in the running system."
            >
              <div className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-6">
                <p className="text-sm leading-relaxed text-muted">
                  {capability.consoleAppearance.surface}
                </p>
                {consoleHref ? (
                  <a
                    href={consoleHref}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-edge bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/30"
                  >
                    {capability.consoleAppearance.replicaRoute
                      ? "Open the console replica"
                      : "Open the public view"}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  <Callout tone="info">
                    This capability surfaces inside the operator console; there
                    is no public replica route for it yet.
                  </Callout>
                )}
              </div>
            </Block>
          </StaggerItem>

          {/* Public data band. */}
          {capability.consoleAppearance.transparencyRoute ? (
            <StaggerItem>
              <Block
                id="public-data"
                title="Public data"
                subtitle="The matching public transparency projection — aggregate-only, illustrative sample data, no tenant detail."
              >
                <a
                  href={capability.consoleAppearance.transparencyRoute}
                  className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-surface p-6 transition-colors hover:border-ink/30"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-ink">
                      Public transparency view
                    </span>
                    <code className="text-xs text-muted">
                      {capability.consoleAppearance.transparencyRoute}
                    </code>
                  </div>
                  <ArrowUpRight
                    size={18}
                    className="shrink-0 text-faint"
                    aria-hidden="true"
                  />
                </a>
              </Block>
            </StaggerItem>
          ) : null}
        </Stagger>
      </Section>
    </main>
  );
}

/* ── building blocks ───────────────────────────────────────────────────── */

function Block({
  id,
  title,
  subtitle,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-5">
      <div className="border-b border-edge pb-3">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ProvenanceCard({
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
