import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { DriftReplica } from "@/components/console-tour/DriftReplica";

export const metadata: Metadata = {
  title: "Drift · adjudicate",
  description:
    "Behavioral-drift replica — active statistical (TVD) drift alerts, per-dimension TVD, and a max-TVD timeline. An illustrative replica of the operator console's drift surface.",
};

/**
 * /console/drift — the behavioral-drift (ADR-132) replica. Renders the static
 * {@link DriftReplica} inside its ConsoleChrome honesty boundary ("Illustrative
 * replica · sample data"). Dark (console) tone. No live data, no admin/DB
 * access — committed fixtures only.
 */
export default function ConsoleDriftPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · drift"
          title="Drift."
          subtitle="Active statistical-drift (TVD) alerts, per-dimension distance, and a max-TVD timeline — a replica of the operator console's behavioral-drift surface."
          backHref="/console"
          backLabel="Back to console"
        />
        <DriftReplica className="mt-12" />
      </Section>
    </main>
  );
}
