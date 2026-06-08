import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { TokenGovernanceReplica } from "@/components/console-tour/TokenGovernanceReplica";

export const metadata: Metadata = {
  title: "Token governance · adjudicate",
  description:
    "Token-cost burn-down across tenants and sessions, with a budget-exhaustion timeline — an illustrative replica of the operator console's Token Governance surface.",
};

/**
 * /console/tokens — the Token Governance replica. Renders the static
 * {@link TokenGovernanceReplica} inside its ConsoleChrome honesty boundary
 * ("Illustrative replica · sample data"). Dark (console) tone. No live data, no
 * admin/DB access — committed fixtures only, with synthetic anonymous ids.
 */
export default function ConsoleTokensPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · tokens"
          title="Token governance."
          subtitle="Token-cost burn-down across tenants and sessions, banded within / near / over budget, with a budget-exhaustion timeline."
          backHref="/console"
          backLabel="Back to console"
        />
        <TokenGovernanceReplica className="mt-12" />
      </Section>
    </main>
  );
}
