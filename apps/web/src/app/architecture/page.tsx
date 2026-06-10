import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Problem } from "@/sections/Problem";
import { PrimitivesDiagram } from "@/sections/PrimitivesDiagram";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { DecisionFan } from "@/components/DecisionFan";
import { BrandGlow } from "@/components/ui/BrandGlow";

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
        title={
          <>
            The mechanism,{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              in detail.
            </span>
          </>
        }
        subtitle="Why a kernel sits between AI intent and side-effect — and the seven primitives that compose it."
      />
      <section className="relative overflow-hidden border-y border-edge bg-surface py-12">
        <BrandGlow />
        <div className="relative z-10 mx-auto max-w-5xl overflow-x-auto px-6">
          <DecisionFan className="h-auto w-full min-w-[600px]" />
        </div>
      </section>
      <Problem />
      <PrimitivesDiagram />

      <Section tone="canvas" className="py-20">
        <div className="max-w-measure">
          <p className="text-eyebrow uppercase tracking-section text-brand-ink">
            Go deeper
          </p>
          <h2 className="mt-2 text-h2 text-ink">Two paths from here</h2>
          <p className="mt-2 text-body text-muted">
            You&apos;ve seen the mechanism and its primitives. Follow one
            decision end-to-end, or wire the kernel into a real deployment.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card
            href="/architecture/data-flow"
            className="group relative flex flex-col gap-3 overflow-hidden"
          >
            <span
              className="absolute inset-x-0 top-0 h-0.5 bg-gradient-primary opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
            <p className="text-eyebrow uppercase tracking-section text-muted">
              Trace one decision
            </p>
            <h3 className="flex items-center justify-between gap-2 text-h4 text-ink">
              How a decision becomes a durable receipt
              <ArrowRight
                size={18}
                className="shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-brand-ink"
                aria-hidden="true"
              />
            </h3>
            <p className="text-sm leading-relaxed text-muted">
              Trace one decision from the AI agent&apos;s intent through the
              in-process kernel into a tamper-evident AuditRecord — mirrored to
              a partitioned Postgres table and pushed live to the operator
              console. Plus the trust boundary that makes this public site safe
              by construction.
            </p>
          </Card>
          <Card
            href="/deploy"
            className="group relative flex flex-col gap-3 overflow-hidden"
          >
            <span
              className="absolute inset-x-0 top-0 h-0.5 bg-gradient-primary opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
            <p className="text-eyebrow uppercase tracking-section text-muted">
              Ship it
            </p>
            <h3 className="flex items-center justify-between gap-2 text-h4 text-ink">
              How to deploy adjudicate
              <ArrowRight
                size={18}
                className="shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-brand-ink"
                aria-hidden="true"
              />
            </h3>
            <p className="text-sm leading-relaxed text-muted">
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
