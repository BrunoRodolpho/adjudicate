import type { Metadata } from "next";
import { DecisionsGrid } from "@/sections/DecisionsGrid";
import { WedgeTable } from "@/sections/WedgeTable";
import { ComparisonPreamble } from "@/sections/ComparisonPreamble";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { DecisionFan } from "@/components/DecisionFan";
import { BrandGlow } from "@/components/ui/BrandGlow";

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
        title={
          <>
            Why allow/deny{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              isn&apos;t enough.
            </span>
          </>
        }
        subtitle="Permission engines like OPA and Cedar return yes/no on a single proposed action. Adjudicate returns six structured decisions — including the four that AI-mediated systems actually need."
      />
      <section className="relative overflow-hidden border-b border-edge bg-surface py-12">
        <BrandGlow />
        <div className="relative z-10 mx-auto max-w-5xl overflow-x-auto px-6">
          <DecisionFan className="h-auto w-full min-w-[600px]" />
        </div>
      </section>
      <ComparisonPreamble />
      <DecisionsGrid />
      <WedgeTable />
    </main>
  );
}
