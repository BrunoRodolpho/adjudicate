import type { Metadata } from "next";
import { HowItWorks } from "@/sections/HowItWorks";
import { DepthHeader } from "@/components/ui/DepthHeader";

export const metadata: Metadata = {
  title: "How it works · adjudicate",
  description:
    "The full mechanism walkthrough — how the decision kernel turns AI intent into adjudicated side-effects, told frame by frame.",
};

/**
 * /how-it-works — depth route for the conceptual story. Mounts the existing
 * <HowItWorks/> section: the six-frame mechanism walkthrough threaded by one
 * concrete scenario (a 100% production deploy intercepted, rewritten to 25%,
 * and audited). Phase 8 upgrades the sizzle reel to the full story film.
 */
export default function HowItWorksPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="How it works"
        title="The mechanism, frame by frame."
        subtitle="One requested action — a 100% production deploy — followed from interception through decision to audit record."
      />
      <HowItWorks />
    </main>
  );
}
