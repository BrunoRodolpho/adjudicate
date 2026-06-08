import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { RedTeamReplica } from "@/components/console-tour/RedTeamReplica";

export const metadata: Metadata = {
  title: "Red team · adjudicate",
  description:
    "Red-team replica — pass/fail summary, adversarial scenarios per attack vector, and a defended-vs-escaped trend over recorded runs. An illustrative replica of the operator console's red-team surface.",
};

/**
 * /console/red-team — the red-team (ADR-133) replica. Renders the static
 * {@link RedTeamReplica} inside its ConsoleChrome honesty boundary
 * ("Illustrative replica · sample data"). Dark (console) tone. No live data, no
 * admin/DB access — committed fixtures only. Only attack-VECTOR categories +
 * aggregate counts are shown; never scenario names or payloads.
 */
export default function ConsoleRedTeamPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · red team"
          title="Red team."
          subtitle="Pass/fail coverage, adversarial scenarios per attack vector, and a defended-vs-escaped trend over recorded runs — a replica of the operator console's red-team surface."
          backHref="/console"
          backLabel="Back to console"
        />
        <RedTeamReplica className="mt-12" />
      </Section>
    </main>
  );
}
