import { Hero } from "@/sections/Hero";
import { Problem } from "@/sections/Problem";
import { DecisionsGrid } from "@/sections/DecisionsGrid";
import { PrimitivesDiagram } from "@/sections/PrimitivesDiagram";
import { WedgeTable } from "@/sections/WedgeTable";
import { Playground } from "@/sections/Playground";
import { GuardMetadataGraph } from "@/sections/GuardMetadataGraph";
import { PacksSection } from "@/sections/PacksSection";
import { ConsolePreview } from "@/sections/ConsolePreview";
import { GetStarted } from "@/sections/GetStarted";
import { FinalCTA, Footer } from "@/sections/FinalCTA";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Problem />
      <DecisionsGrid />
      <PrimitivesDiagram />
      <WedgeTable />
      <Playground />
      <GuardMetadataGraph />
      <PacksSection />
      <ConsolePreview />
      <GetStarted />
      <FinalCTA />
      <Footer />
    </main>
  );
}
