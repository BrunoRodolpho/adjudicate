import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Problem } from "@/sections/Problem";
import { PrimitivesDiagram } from "@/sections/PrimitivesDiagram";
import { Footer } from "@/sections/FinalCTA";

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
      <Footer />
    </main>
  );
}

function DepthHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="bg-canvas pb-6 pt-10">
      <div className="mx-auto max-w-6xl px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
        >
          <ArrowLeft size={12} /> Back to homepage
        </Link>
        <p className="mt-6 text-xs uppercase tracking-section text-muted">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted">{subtitle}</p>
      </div>
    </header>
  );
}
