import { Hero } from "@/sections/Hero";
import { HowItWorks } from "@/sections/HowItWorks";
import { PacksSection } from "@/sections/PacksSection";
import { PlaygroundEntry } from "@/sections/PlaygroundEntry";
import { Playground } from "@/sections/Playground";
import { DepthLinks } from "@/sections/DepthLinks";
import { GetStarted } from "@/sections/GetStarted";
import { LatestPosts } from "@/sections/LatestPosts";
import { FinalCTA, Footer } from "@/sections/FinalCTA";

/**
 * Homepage — conversion-focused for the 99%. The conceptual story
 * (HowItWorks) precedes the playground; Pack context precedes interaction.
 *
 * Phase 5 split: depth artifacts moved off the homepage onto dedicated
 * routes so engaged visitors can still reach them but the conversion fold
 * stays uncluttered:
 *   - Problem + PrimitivesDiagram → /architecture
 *   - WedgeTable                  → /comparisons
 *   - GuardMetadataGraph + ConsolePreview → /introspection
 *
 * `DepthLinks` below the playground signposts those three routes for
 * visitors who scrolled past the conversion fold and want more depth.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <PacksSection />
      <PlaygroundEntry />
      <Playground />
      <DepthLinks />
      <GetStarted />
      <LatestPosts />
      <FinalCTA />
      <Footer />
    </main>
  );
}
