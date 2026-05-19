import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GuardMetadataGraph } from "@/sections/GuardMetadataGraph";
import { ConsolePreview } from "@/sections/ConsolePreview";
import { Footer } from "@/sections/FinalCTA";

export const metadata: Metadata = {
  title: "Introspection · adjudicate",
  description:
    "GuardMetadata + AuditRecord — programmatic introspection of every rule that governs your AI actions, for auditors and analyzers.",
  openGraph: {
    title: "Introspection · adjudicate",
    description: "Reconstruct why your AI system acted.",
    images: [{ url: "/og-introspection.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og-introspection.png"] },
};

/**
 * /introspection — depth route for the auditor / compliance / analyzer
 * audience. Mounts the demoted GuardMetadataGraph (radial guard graph
 * powered by describePolicyBundle) and ConsolePreview (operator console
 * preview). Together these answer "how do I know what rules govern this
 * system, and how do I verify they actually run?".
 */
export default function IntrospectionPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Depth · introspection"
        title="Your policy is no longer a black box."
        subtitle="Every guard carries optional structured metadata that downstream tooling — auditors, analyzers, the operator console — can read programmatically. The graph below renders one descriptor per shipped Pack."
      />
      <GuardMetadataGraph />
      <ConsolePreview />
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
