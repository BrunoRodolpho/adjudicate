import { Hero } from "@/sections/Hero";
import { StepActs } from "@/sections/home/StepActs";
import { StepDecides } from "@/sections/home/StepDecides";
import { StepReceipt } from "@/sections/home/StepReceipt";
import { StepConsole } from "@/sections/home/StepConsole";
import { WhoItsFor } from "@/sections/home/WhoItsFor";
import { Positioning } from "@/sections/home/Positioning";
import { SocialProof } from "@/sections/home/SocialProof";
import { PlaygroundEntry } from "@/sections/PlaygroundEntry";
import { DepthLinks } from "@/sections/DepthLinks";
import { GetStarted } from "@/sections/GetStarted";
import { FinalCTA } from "@/sections/FinalCTA";

/**
 * Homepage — built around ONE comprehension test: a first-time visitor, after
 * a single pass and without leaving the page, can answer all four —
 *   1. What happened?            → StepActs
 *   2. What did the guard decide? → StepDecides
 *   3. What was recorded?         → StepReceipt (the centerpiece, real kernel)
 *   4. Where does the operator see it? → StepConsole (the one dark band)
 *
 * The four spine sections run light → light → light → DARK, so the console
 * step reads as a literal surface change ("you've left marketing, this is the
 * operator view"). The supporting sections (who it's for, positioning, proof)
 * follow, then a playground teaser and the get-started / depth / CTA cluster.
 *
 * Off-home now: the inline full <Playground/> (→ /playground), <HowItWorks/>
 * (→ /how-it-works), and <LatestPosts/> (→ /blog). The homepage stays a tight,
 * scannable spine — not an encyclopedia.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <StepActs />
      <StepDecides />
      <StepReceipt />
      <StepConsole />
      <WhoItsFor />
      <Positioning />
      <SocialProof />
      <PlaygroundEntry />
      <GetStarted />
      <DepthLinks />
      <FinalCTA />
    </main>
  );
}
