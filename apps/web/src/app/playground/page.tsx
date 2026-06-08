import type { Metadata } from "next";
import { Playground } from "@/sections/Playground";
import { DepthHeader } from "@/components/ui/DepthHeader";

export const metadata: Metadata = {
  title: "Playground · adjudicate",
  description:
    "Adjudicate real intents against the live kernel: a Guided walkthrough of real business cases, or a Sandbox to configure your own intent — every decision returns a signed receipt.",
};

/**
 * /playground — depth route for the interactive playground. Mounts the
 * two-mode <Playground/> section: a Guided walkthrough (one business case at a
 * time, plain language) and a Sandbox (configure & test a pack/intent via a
 * schema-aware form), both running the real kernel server-side.
 */
export default function PlaygroundPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Playground"
        title="Adjudicate against the real kernel."
        subtitle="Start Guided — walk a real business case one step at a time, in plain language. Then open the Sandbox to configure your own intent and test it. Every decision runs the real Packs server-side and returns a signed receipt."
      />
      <Playground />
    </main>
  );
}
