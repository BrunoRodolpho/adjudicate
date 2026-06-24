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
import { maturityFor } from "@/lib/maturity";

/**
 * CapabilityPageLayout — the capability deep-dive page body. Renders ALL 14
 * capabilities (Tier 1 and Tier 2 alike) — `tier` is a maturity marker, not a
 * page-completeness one.
 *
 * SERVER component. Composed as console-toned bands so a long single-column
 * page reads as the dark constitutional control room rather than one flat
 * scroll (the R4 re-score's recurring note on the whole 14-page cluster):
 *
 *   1. DepthHeader — name + one-liner + back.
 *   2. INTRO band (console) — badges + outcome chips, the "what it does"
 *      mechanism as a measured editorial lead (not a wide prose wall), and the
 *      Step-2 "Guard decides" context as a subtle inset.
 *   3. WORKED EXAMPLE band (console) — the signature moment, its own band.
 *   4. PROVENANCE + WHERE IT SURFACES band (console) — the governing ADR + the
 *      implementing source file, then the console replica and the public
 *      transparency projection merged into one "where an operator sees it" grid
 *      (previously two thin, placeholder-feeling sections).
 *
 * Cards sit on a console panel and lift on a hairline edge rather than a light
 * shadow, so the surfaces read as material on the dark canvas, not boxed.
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
  const transparencyRoute = capability.consoleAppearance.transparencyRoute;
  const realKernel = capability.interactivity === "real-kernel";
  const maturity = maturityFor(realKernel);

  return (
    <main>
      <DepthHeader
        eyebrow="Capability"
        title={capability.name}
        subtitle={capability.oneLiner}
        backHref="/capabilities"
        backLabel="Back to capabilities"
      />

      {/* ── Intro band ─────────────────────────────────────────────────── */}
      <Section tone="console" className="pt-8 md:pt-12">
        <Stagger className="flex flex-col gap-8">
          <StaggerItem className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="adr">{capability.adr.id}</Badge>
              <Badge tone={maturity.tone}>{maturity.label}</Badge>
              <Badge tone="neutral">{capability.pkg.name}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {capability.outcomes.map((kind) => (
                <DecisionChip key={kind} kind={kind} size="sm" />
              ))}
            </div>
          </StaggerItem>

          {/* What it does — a measured editorial lead, not a wide prose wall. */}
          <StaggerItem>
            <section id="what-it-does">
              <h2 className="text-eyebrow uppercase tracking-section text-brand-ink">
                What it does
              </h2>
              <p className="mt-3 max-w-measure text-lead leading-relaxed text-console-muted">
                {capability.whatItDoes}
              </p>
            </section>
          </StaggerItem>

          {/* Step-2 context — a subtle inset, lifted off the band. */}
          <StaggerItem>
            <div className="flex max-w-measure flex-col gap-3 rounded-xl border border-console-edge bg-console-panel p-5">
              <StepStrip active={2} />
              <p className="text-sm leading-relaxed text-console-muted">
                This is what happens at{" "}
                <span className="font-medium text-console-ink">
                  Step 2 — Guard decides
                </span>{" "}
                for {capability.name.toLowerCase()}: the kernel adjudicates the
                proposed action and disposes it into one of the six outcomes
                above, with a structured basis the receipt carries forward.
              </p>
            </div>
          </StaggerItem>
        </Stagger>
      </Section>

      {/* ── Worked example band (signature moment) ─────────────────────── */}
      <Section tone="console">
        <Block
          id="worked-example"
          title="Worked example"
          subtitle={
            realKernel
              ? "The real kernel, run server-side at render time — not a mock."
              : "An illustrative example projected from public, aggregate-only sample data."
          }
        >
          <WorkedExample capability={capability} />
        </Block>
      </Section>

      {/* ── Provenance + where it surfaces band ────────────────────────── */}
      <Section tone="console">
        <Stagger className="flex flex-col gap-16">
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

          <StaggerItem>
            <Block
              id="surfaces"
              title="Where it surfaces"
              subtitle="Where an operator sees this capability in the running system — and the matching public, aggregate-only transparency view."
            >
              <div
                className={
                  transparencyRoute
                    ? "grid gap-4 sm:grid-cols-2"
                    : "grid gap-4"
                }
              >
                <div className="flex flex-col gap-4 rounded-xl border border-console-edge bg-console-panel p-6">
                  <span className="text-xs uppercase tracking-section text-console-muted">
                    Operator console
                  </span>
                  <p className="text-sm leading-relaxed text-console-muted">
                    {capability.consoleAppearance.surface}
                  </p>
                  {consoleHref ? (
                    <a
                      href={consoleHref}
                      className="focus-ring-console mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg border border-console-edge bg-console-canvas px-3 py-2 text-sm font-medium text-console-ink transition-colors hover:border-console-faint"
                    >
                      {capability.consoleAppearance.replicaRoute
                        ? "Open the console replica"
                        : "Open the public view"}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : (
                    <Callout tone="info">
                      This capability surfaces inside the operator console;
                      there is no public replica route for it yet.
                    </Callout>
                  )}
                </div>

                {transparencyRoute ? (
                  <a
                    href={transparencyRoute}
                    className="focus-ring-console group flex flex-col gap-2 rounded-xl border border-console-edge bg-console-panel p-6 transition-colors hover:border-console-faint"
                  >
                    <span className="flex items-center justify-between text-xs uppercase tracking-section text-console-muted">
                      Public transparency view
                      <ArrowUpRight
                        size={16}
                        className="text-console-faint transition-colors group-hover:text-brand-ink"
                        aria-hidden="true"
                      />
                    </span>
                    <p className="text-sm leading-relaxed text-console-muted">
                      Aggregate-only, illustrative sample data — no tenant
                      detail — published as a public projection.
                    </p>
                    <code className="mt-auto break-all text-[11px] text-console-muted">
                      {transparencyRoute}
                    </code>
                  </a>
                ) : null}
              </div>
            </Block>
          </StaggerItem>
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
      <div>
        <h2 className="text-h3 text-console-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-1 max-w-measure text-body-sm text-console-muted">
            {subtitle}
          </p>
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
      className="focus-ring-console group flex flex-col gap-2 rounded-xl border border-console-edge bg-console-panel p-5 transition-colors hover:border-console-faint"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-section text-console-muted">
          <Icon size={13} aria-hidden="true" />
          {eyebrow}
        </span>
        <ArrowUpRight
          size={14}
          className="text-console-faint transition-colors group-hover:text-brand-ink"
          aria-hidden="true"
        />
      </div>
      <code className="text-base font-semibold text-console-ink">{primary}</code>
      <code className="break-all text-[11px] text-console-muted">{secondary}</code>
    </a>
  );
}
