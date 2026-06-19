import { Hero } from "@/sections/Hero";
import { Reveal } from "@/components/home/Reveal";
import { MagicMoment } from "@/sections/home/MagicMoment";
import { StepActs } from "@/sections/home/StepActs";
import { OutcomesBento } from "@/sections/home/OutcomesBento";
import { StepReceipt } from "@/sections/home/StepReceipt";
import { StepConsole } from "@/sections/home/StepConsole";
import { RecipesTeaser } from "@/sections/home/RecipesTeaser";
import { WhoItsFor } from "@/sections/home/WhoItsFor";
import { Positioning } from "@/sections/home/Positioning";
import { SocialProof } from "@/sections/home/SocialProof";
import { PlaygroundEntry } from "@/sections/PlaygroundEntry";
import { DepthLinks } from "@/sections/DepthLinks";
import { GetStarted } from "@/sections/GetStarted";
import { FAQ } from "@/sections/home/FAQ";
import { FinalCTA } from "@/sections/FinalCTA";

/**
 * Homepage — outcome-first repositioning (round-2 AUDIT pass).
 *
 * The hero now leads with the outcome (guardrails beyond block-or-allow), then
 * MagicMoment lands the conversion punch immediately: one risky deploy, caught
 * and rewritten by the REAL kernel, with a tamper-evident receipt. From there the four
 * spine sections answer the comprehension test in order —
 *   1. What happened?            → StepActs
 *   2. What can the guard decide? → OutcomesBento (the six-outcome surface)
 *   3. What was recorded?         → StepReceipt (the centerpiece, real kernel)
 *   4. Where does the operator see it? → StepConsole (the one dark band)
 *
 * The spine runs light → light → light → DARK so the console step reads as a
 * literal surface change. Supporting sections (who it's for, positioning,
 * proof, playground teaser, get-started, depth, CTA) follow.
 *
 * Motion: the spine steps + MagicMoment each gently reveal on scroll, and per
 * AUDIT P1 every secondary section is now wrapped in <Reveal> for a gentle
 * cascade down the page. Reveal is reduced-motion-safe (renders static under
 * prefers-reduced-motion). The #step-* / #magic-moment anchors live inside each
 * section, untouched.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <Reveal>
        <MagicMoment />
      </Reveal>
      {/* Spine — each step gently reveals on scroll (static under reduced
          motion). The #step-* anchors live inside each section. */}
      <Reveal>
        <StepActs />
      </Reveal>
      <Reveal>
        <OutcomesBento />
      </Reveal>
      <Reveal>
        <StepReceipt />
      </Reveal>
      <Reveal>
        <StepConsole />
      </Reveal>
      {/* Secondary sections — wrapped in Reveal for a gentle cascade
          (AUDIT P1: "all secondary sections lack Reveal"). */}
      <Reveal>
        <RecipesTeaser />
      </Reveal>
      <Reveal>
        <WhoItsFor />
      </Reveal>
      <Reveal>
        <Positioning />
      </Reveal>
      <Reveal>
        <SocialProof />
      </Reveal>
      <Reveal>
        <PlaygroundEntry />
      </Reveal>
      <Reveal>
        <GetStarted />
      </Reveal>
      <Reveal>
        <FAQ />
      </Reveal>
      <Reveal>
        <DepthLinks />
      </Reveal>
      <Reveal>
        <FinalCTA />
      </Reveal>
    </main>
  );
}
