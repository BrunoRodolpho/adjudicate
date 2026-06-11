import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { AiBomExplorerReplica } from "@/components/console-tour/AiBomExplorerReplica";

export const metadata: Metadata = {
  title: "AI-BOM explorer · adjudicate",
  description:
    "AI Bill-of-Materials explorer replica — model, tools, prompt hashes, and guardrails for each reference pack, over committed sample data.",
};

/**
 * /console/ai-bom — the AI-BOM Explorer operator-console replica (ADR-130).
 *
 * Renders the {@link AiBomExplorerReplica}: a two-pane, static mirror of the
 * console's AI-BOM Explorer inside the ConsoleChrome honesty boundary, driven by
 * the committed `AI_BOM_TRANSPARENCY_SAMPLE`. Every BOM field is non-sensitive
 * by design (hashes + component references, never contents — ADR-127). apps/web
 * reads no DATABASE_URL/REDIS_URL/admin token and fetches no /api/admin or SSE.
 * Dark (console) tone.
 */
export default function ConsoleAiBomPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · AI-BOM explorer"
          title="AI-BOM explorer."
          subtitle="A faithful replica of the operator console's AI Bill-of-Materials browser — model, tools, prompt hashes, and guardrails per pack — over committed sample data."
          backHref="/console"
          backLabel="Back to console"
        />
        <div className="mt-12">
          <AiBomExplorerReplica />
        </div>
      </Section>
    </main>
  );
}
