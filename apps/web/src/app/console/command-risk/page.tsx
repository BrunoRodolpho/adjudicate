import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { CommandRiskReplica } from "@/components/console-tour/CommandRiskReplica";

export const metadata: Metadata = {
  title: "Command risk · adjudicate",
  description:
    "Shell-command-risk dispositions by category, disposition totals, and a blocked-commands list — command text is never shown, redacted by construction. An illustrative replica of the operator console's Command Risk surface.",
};

/**
 * /console/command-risk — the Command Risk replica. Renders the static
 * {@link CommandRiskReplica} inside its ConsoleChrome honesty boundary
 * ("Illustrative replica · sample data"). Dark (console) tone. No live data, no
 * admin/DB access — committed fixtures only.
 *
 * SECURITY: the blocked-commands table shows ONLY timestamp + intent kind +
 * decision + category — NEVER the command text or rule ids. Redaction is by
 * construction: the surface has no field that could carry a command.
 */
export default function ConsoleCommandRiskPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · command risk"
          title="Command risk."
          subtitle="Shell-command-risk dispositions by category, with disposition totals and a blocked-commands list. Command text is never shown — redacted by construction."
          backHref="/console"
          backLabel="Back to console"
        />
        <CommandRiskReplica className="mt-12" />
      </Section>
    </main>
  );
}
