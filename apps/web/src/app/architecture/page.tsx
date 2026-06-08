import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Problem } from "@/sections/Problem";
import { PrimitivesDiagram } from "@/sections/PrimitivesDiagram";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Architecture · adjudicate",
  description:
    "How adjudicate's decision kernel sits between AI intent and system execution — and the seven primitives underneath.",
  openGraph: {
    title: "Architecture · adjudicate",
    description:
      "How adjudicate's decision kernel sits between AI intent and system execution.",
    images: [{ url: "/og-architecture.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og-architecture.png"] },
};

/**
 * /architecture — depth route for the 1% audience evaluating the kernel
 * mechanics. Mounts the demoted Problem (LLM/DB direct vs kernel-mediated)
 * and PrimitivesDiagram (seven source files) sections from the v0.1
 * homepage. Per the Phase 5 plan, this exists to keep the homepage
 * conversion-focused while letting depth-seeking visitors click through
 * to the real material.
 */
export default function ArchitecturePage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Depth · architecture"
        title="The mechanism, in detail."
        subtitle="Why a kernel sits between AI intent and side-effect — and the seven primitives that compose it."
      />
      <Problem />
      <PrimitivesDiagram />

      <Section tone="canvas" className="py-20">
        <h2 className="text-xs uppercase tracking-section text-muted">
          Go deeper
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card href="/architecture/data-flow" className="group">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-ink">
              How a decision becomes a durable receipt
              <ArrowRight
                size={16}
                className="text-faint transition-colors group-hover:text-ink"
                aria-hidden="true"
              />
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Trace one decision from the AI agent&apos;s intent through the
              in-process kernel into a tamper-evident AuditRecord — mirrored to
              a partitioned Postgres table and pushed live to the operator
              console. Plus the trust boundary that makes this public site safe
              by construction.
            </p>
          </Card>
          <Card href="/deploy" className="group">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-ink">
              How to deploy adjudicate
              <ArrowRight
                size={16}
                className="text-faint transition-colors group-hover:text-ink"
                aria-hidden="true"
              />
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The library / in-process deployment model and the self-hosted,
              open-source operator console — how the pieces wire together in a
              real deployment.
            </p>
          </Card>
        </div>
      </Section>
    </main>
  );
}
