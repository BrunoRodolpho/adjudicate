import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { AuditExplorerReplica } from "@/components/console-tour/AuditExplorerReplica";

export const metadata: Metadata = {
  title: "Audit explorer · adjudicate",
  description:
    "Audit-explorer replica with a simulated live tail of adjudicated decisions.",
};

/**
 * /console/audit-explorer — the flagship operator-console replica.
 *
 * Renders the {@link AuditExplorerReplica}: a plain-table mirror of the
 * console's Audit Explorer inside the ConsoleChrome honesty boundary, driven by
 * an HONEST simulated tail (transport badge reads "SIMULATED"; no network, no
 * SSE/poll). All data is the committed `CONSOLE_REPLICA_RECORDS` sample fixture.
 * Dark (console) tone.
 */
export default function ConsoleAuditExplorerPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · audit explorer"
          title="Audit explorer."
          subtitle="A faithful replica of the operator console's audit feed, driven by a simulated live tail over committed sample data."
          backHref="/console"
          backLabel="Back to console"
        />
        <div className="mt-12">
          <AuditExplorerReplica />
        </div>
      </Section>
    </main>
  );
}
