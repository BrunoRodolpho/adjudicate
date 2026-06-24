import { Reveal } from "@/components/home/Reveal";
import { FinalCTADark } from "@/sections/FinalCTADark";
import { Hero } from "@/sections/Hero";
import { AdjudicantPlane } from "@/sections/home/AdjudicantPlane";
import { AuditChain } from "@/sections/home/AuditChain";
import { Capabilities } from "@/sections/home/Capabilities";
import { KernelGuards } from "@/sections/home/KernelGuards";
import { SafetyLaws } from "@/sections/home/SafetyLaws";
import { SixOutcomes } from "@/sections/home/SixOutcomes";
import { TrustRoot } from "@/sections/home/TrustRoot";
import { UseCases } from "@/sections/home/UseCases";

/**
 * Homepage — the constitutional control room (dark). The hero lands first, then
 * the act-based narrative sections reveal on scroll.
 */
export default function HomePage() {
  return (
    <main className="bg-console-canvas">
      <Hero />
      <Reveal>
        <TrustRoot />
      </Reveal>
      <Reveal>
        <KernelGuards />
      </Reveal>
      <Reveal>
        <SixOutcomes />
      </Reveal>
      <Reveal>
        <Capabilities />
      </Reveal>
      <Reveal>
        <AuditChain />
      </Reveal>
      <Reveal>
        <SafetyLaws />
      </Reveal>
      <Reveal>
        <AdjudicantPlane />
      </Reveal>
      <Reveal>
        <UseCases />
      </Reveal>
      <Reveal>
        <FinalCTADark />
      </Reveal>
    </main>
  );
}
