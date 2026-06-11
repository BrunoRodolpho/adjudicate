import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { DashboardReplica } from "@/components/console-tour/DashboardReplica";

export const metadata: Metadata = {
  title: "Dashboard · adjudicate",
  description:
    "Decision-outcome distribution at a glance, across the six adjudicate outcomes — an illustrative replica of the operator console dashboard.",
};

/**
 * /console/dashboard — the focused decision-outcome dashboard replica. Renders
 * the static {@link DashboardReplica} inside its ConsoleChrome honesty boundary
 * ("Illustrative replica · sample data"). Dark (console) tone. No live data,
 * no admin/DB access — committed fixtures only.
 */
export default function ConsoleDashboardPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · dashboard"
          title="Dashboard."
          subtitle="Decision-outcome distribution at a glance, across all six adjudicate outcomes."
          backHref="/console"
          backLabel="Back to console"
        />
        <DashboardReplica className="mt-12" />
      </Section>
    </main>
  );
}
