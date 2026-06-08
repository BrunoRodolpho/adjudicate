import type { Metadata } from "next";
import Link from "next/link";
import { HowItWorks } from "@/sections/HowItWorks";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

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

      {/* The receipt, materializing. A tasteful looping clip closing the
          walkthrough on its end-state artifact — the signed receipt every
          adjudicated action leaves behind. Light (surface) tone so it reads as
          a section visual, not a second console. Server-renderable: a plain
          muted/autoplay/loop <video> with no controls and no client
          interactivity. No poster is shipped for this clip, so the attribute
          is omitted. Distinct from the homepage Step-3 real receipt — this is
          an illustrative loop, the playground link below is the live one. */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="The artifact"
          title="Every decision becomes a signed receipt"
        />
        <figure className="mt-10 overflow-hidden rounded-2xl border border-edge bg-surface shadow-lg">
          <video
            src="/receipt-materialize.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-label="An illustrative loop of a signed decision receipt materializing field by field."
            className="block h-auto w-full"
          />
          <figcaption className="border-t border-edge px-4 py-2.5 text-xs text-muted">
            Illustrative loop · an adjudicated action settling into its signed
            receipt.{" "}
            <Link
              href="/playground"
              className="font-medium text-ink underline decoration-edge underline-offset-4 transition-colors hover:decoration-ink/40"
            >
              See it on a real decision
            </Link>
            .
          </figcaption>
        </figure>
      </Section>
    </main>
  );
}
