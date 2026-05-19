import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DecisionsGrid } from "@/sections/DecisionsGrid";
import { WedgeTable } from "@/sections/WedgeTable";
import { Footer } from "@/sections/FinalCTA";

export const metadata: Metadata = {
  title: "Comparisons · adjudicate",
  description:
    "How adjudicate compares to OPA, Cedar, and other policy engines — and where the six-decision algebra is the wedge.",
  openGraph: {
    title: "Comparisons · adjudicate",
    description: "Why allow/deny isn't enough for AI-mediated systems.",
    images: [{ url: "/og-comparisons.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og-comparisons.png"] },
};

/**
 * /comparisons — depth route comparing adjudicate against permission /
 * authorization engines (OPA, Cedar). Mounts the demoted WedgeTable.
 * Audience: visitors who already know OPA/Cedar and want to see how
 * the six-decision algebra differs from allow/deny.
 */
export default function ComparisonsPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Depth · comparisons"
        title="Why allow/deny isn't enough."
        subtitle="Permission engines like OPA and Cedar return yes/no on a single proposed action. Adjudicate returns six structured decisions — including the four that AI-mediated systems actually need."
      />
      <DecisionsGrid />
      <WedgeTable />
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
