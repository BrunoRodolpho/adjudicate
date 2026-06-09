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
            {cap.tier === 1 ? (
              <Badge tone="shipped">Tier 1</Badge>
            ) : (
              <Badge tone="roadmap">Tier 2</Badge>
            )}
          </div>

          <div>
            <h3 className="text-base font-semibold leading-tight text-ink">
              {cap.name}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {cap.oneLiner}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {cap.outcomes.map((kind) => (
              <DecisionChip key={kind} kind={kind} size="sm" />
            ))}
          </div>

          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-section text-muted">
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
      <Section>
        <Reveal>
          <DepthHeader
            eyebrow="Capabilities"
            title="14 capabilities, four families."
            subtitle="Every capability maps to a real package and a real ADR, and every one opens a full deep-dive. The Tier badge marks maturity: Tier 1 runs the real kernel or a live projection; Tier 2 is fixture-illustrative."
          />
        </Reveal>

        <div className="mt-12 flex flex-col gap-16">
          {FAMILIES.map((family) => {
            const caps = CAPABILITIES.filter((c) => c.family === family.id);
            return (
              <div key={family.id}>
                <div className="border-b border-edge pb-4">
                  <h2 className="text-xl font-semibold tracking-tight text-ink">
                    {family.label}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{family.blurb}</p>
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
