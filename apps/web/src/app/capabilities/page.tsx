import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
import { FamilyMap } from "@/components/FamilyMap";
import { BrandGlow } from "@/components/ui/BrandGlow";
import { maturityFor } from "@/lib/maturity";
import {
  CAPABILITIES,
  type CapabilityContent,
  type CapabilityFamily,
} from "@/content/capabilities";

export const metadata: Metadata = {
  title: "Capabilities · adjudicate",
  description:
    "All 14 adjudicate capabilities, each mapped to a real package and ADR, grouped into four families.",
  openGraph: {
    title: "Capabilities · adjudicate",
    description:
      "All 14 adjudicate capabilities, each mapped to a real package and ADR, grouped into four families.",
    type: "website",
    images: [{ url: "/og-capabilities.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-capabilities.png"],
  },
};

/** Display order + copy for the four capability families. */
const FAMILIES: ReadonlyArray<{
  readonly id: CapabilityFamily;
  readonly label: string;
  readonly blurb: string;
}> = [
  {
    id: "content-safety",
    label: "Content & data safety",
    blurb: "Keep classified data and ungrounded output out of side-effects.",
  },
  {
    id: "adversarial",
    label: "Adversarial & behavioral",
    blurb: "Test defenses, watch for drift, and gate risky commands.",
  },
  {
    id: "budget-integrity",
    label: "Budget & integrity",
    blurb: "Cap cost, seal configuration, and lint policy coherence.",
  },
  {
    id: "workflow",
    label: "Workflow & governance",
    blurb: "Human approvals, memory, and the governance packs.",
  },
];

/**
 * One capability card. Every card now links to its full /capabilities/[slug]
 * deep-dive — `tier` is shown only as a subtle maturity badge, not as a gate.
 *
 * Wrapped in StaggerItem + HoverLift so the grid cascades in on scroll and each
 * card lifts on hover (the same affordance the /recipes index uses). Both are
 * reduced-motion-safe; the Card supplies the border + base hover.
 */
function CapabilityCard({ cap }: { readonly cap: CapabilityContent }) {
  return (
    <StaggerItem className="h-full">
      <HoverLift className="h-full">
        <Card
          href={`/capabilities/${cap.slug}`}
          className="flex h-full flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Badge tone="adr">{cap.adr.id}</Badge>
            <Badge tone={maturityFor(cap.interactivity === "real-kernel").tone}>
              {maturityFor(cap.interactivity === "real-kernel").label}
            </Badge>
          </div>

          <div>
            <h3 className="text-base font-semibold leading-tight text-console-ink">
              {cap.name}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-console-muted">
              {cap.oneLiner}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {cap.outcomes.map((kind) => (
              <DecisionChip key={kind} kind={kind} size="sm" />
            ))}
          </div>

          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-section text-console-muted">
            Open capability
            <ArrowRight size={12} aria-hidden="true" />
          </p>
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}

/**
 * /capabilities — the catalogue index. The 14 capabilities, each grounded in a
 * real package + ADR, grouped into the four families. Every card links to its
 * full /capabilities/[slug] deep-dive; the Tier badge is a subtle maturity
 * marker (Tier 1 = real-kernel/live-projection, Tier 2 = fixture-illustrative).
 */
export default function CapabilitiesPage() {
  return (
    <main>
      <Section tone="console">
        <Reveal>
          <DepthHeader
            eyebrow="Capabilities"
            title={
              <>
                14 capabilities,{" "}
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  four families.
                </span>
              </>
            }
            subtitle="Every capability maps to a real package and a real ADR, and every one opens a full deep-dive. The badge marks how each example is shown: 'Live · real kernel' runs the real kernel in your browser — four capabilities (PII guard, command-risk, token-budget, release-gating); 'Illustrative' renders from committed sample data, each clearly labelled."
          />
        </Reveal>

        <div className="relative mt-10 overflow-hidden rounded-2xl border border-console-edge bg-console-panel px-6 py-10">
          <BrandGlow />
          <div className="relative z-10 mx-auto max-w-4xl overflow-x-auto">
            <FamilyMap className="h-auto w-full min-w-[560px]" />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-16">
          {FAMILIES.map((family) => {
            const caps = CAPABILITIES.filter((c) => c.family === family.id);
            return (
              <div key={family.id}>
                <div>
                  <h2 className="text-h3 text-console-ink">{family.label}</h2>
                  <p className="mt-1 text-body-sm text-console-muted">{family.blurb}</p>
                </div>
                <Stagger className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {caps.map((cap) => (
                    <CapabilityCard key={cap.slug} cap={cap} />
                  ))}
                </Stagger>
              </div>
            );
          })}
        </div>
      </Section>
    </main>
  );
}
