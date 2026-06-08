import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { ApprovalCenterReplica } from "@/components/console-tour/ApprovalCenterReplica";

export const metadata: Metadata = {
  title: "Approval center · adjudicate",
  description:
    "The REQUEST_CONFIRMATION → human-review flow: a pending queue, durable decision history, and the request → resolved → resumed audit chain — an illustrative replica of the operator console's Approval Center.",
};

/**
 * /console/approvals — the Approval Center replica. Renders the static
 * {@link ApprovalCenterReplica} inside its ConsoleChrome honesty boundary
 * ("Illustrative replica · sample data"). Dark (console) tone. No live data, no
 * admin/DB access — committed fixtures only. Resolving is display-only; the
 * replica carries an amber banner mirroring the console's disclosure that real
 * authorization happens in the adopter's adapter.
 */
export default function ConsoleApprovalsPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · approvals"
          title="Approval center."
          subtitle="The REQUEST_CONFIRMATION → human-review flow — a pending queue, durable decision history, and the request → resolved → resumed audit chain."
          backHref="/console"
          backLabel="Back to console"
        />
        <ApprovalCenterReplica className="mt-12" />
      </Section>
    </main>
  );
}
