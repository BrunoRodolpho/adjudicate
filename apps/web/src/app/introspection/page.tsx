import type { Metadata } from "next";
import { GuardMetadataGraph } from "@/sections/GuardMetadataGraph";
import { ConsolePreview } from "@/sections/ConsolePreview";
import { DepthHeader } from "@/components/ui/DepthHeader";

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
    </main>
  );
}
