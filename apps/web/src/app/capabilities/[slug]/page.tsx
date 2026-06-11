import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CAPABILITIES, type CapabilityContent } from "@/content/capabilities";
import { CapabilityPageLayout } from "@/components/capabilities/CapabilityPageLayout";

/**
 * /capabilities/[slug] — the per-capability route. One dynamic page renders all
 * 14 entries from the {@link CAPABILITIES} registry through the SAME full
 * {@link CapabilityPageLayout} deep-dive — Tier 1 and Tier 2 alike:
 *
 *   • Tier 1 → real-kernel / live-projection worked example.
 *   • Tier 2 → a fixture-illustrative worked example (a real replica record, a
 *     featured /console replica, a pack's declared intents, or a titled
 *     illustrative explainer), each clearly labelled inside the page.
 *   • unknown slug → notFound().
 *
 * `tier` is a maturity marker only; it never gates page completeness. The layout
 * reads `capability.interactivity` / `capability.workedExample.kind` to choose
 * the right worked-example rendering and the right "shipped vs illustrative"
 * framing, so there is no second "reference" branch to maintain.
 *
 * `generateStaticParams` prebuilds every registry slug, so all 14 are static.
 */

function findCapability(slug: string): CapabilityContent | undefined {
  return CAPABILITIES.find((c) => c.slug === slug);
}

export function generateStaticParams(): Array<{ slug: string }> {
  return CAPABILITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cap = findCapability(slug);
  if (!cap) {
    return { title: "Capability · adjudicate" };
  }
  const title = `${cap.name} · Capabilities · adjudicate`;
  const ogImage = "/og/capabilities/" + cap.slug + ".png";
  return {
    title,
    description: cap.oneLiner,
    openGraph: {
      title,
      description: cap.oneLiner,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
    },
  };
}

export default async function CapabilityPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cap = findCapability(slug);
  if (!cap) notFound();

  return <CapabilityPageLayout capability={cap} />;
}
