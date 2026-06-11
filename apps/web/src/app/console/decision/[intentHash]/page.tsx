import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { DecisionTraceReplica } from "@/components/console-tour/DecisionTraceReplica";
import {
  CONSOLE_REPLICA_RECORDS,
  CONSOLE_REPLICA_RECORDS_BY_HASH,
} from "@/lib/console-replica-records";

/**
 * /console/decision/[intentHash] — the deepest console replica: the full
 * anatomy of a single adjudicated receipt. Next 15 dynamic route — `params` is
 * a Promise that must be awaited. Every intentHash in the committed sample feed
 * is prerendered via `generateStaticParams`; `dynamicParams` stays on so an
 * unmatched hash still resolves at request time and degrades to the replica's
 * own EmptyState. Dark (console) tone.
 *
 * The decision detail renders only from clearly-labeled committed sample data
 * inside the ConsoleChrome honesty boundary — apps/web reads no live operator
 * data (no DATABASE_URL/REDIS_URL/admin token, no /api/admin or SSE fetch).
 */
export const dynamicParams = true;

export function generateStaticParams(): Array<{ intentHash: string }> {
  return CONSOLE_REPLICA_RECORDS.map((record) => ({
    intentHash: record.intentHash,
  }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ intentHash: string }>;
}): Promise<Metadata> {
  const { intentHash } = await params;
  const record = CONSOLE_REPLICA_RECORDS_BY_HASH.get(intentHash);
  const title = record
    ? `${record.decision.kind} · ${record.envelope.kind} receipt · adjudicate`
    : "Decision receipt · adjudicate";
  return {
    title,
    description:
      "The full anatomy of a single adjudicated decision receipt — envelope, trace, decision, basis, audit, and cryptographic detail.",
  };
}

export default async function ConsoleDecisionPage({
  params,
}: {
  readonly params: Promise<{ intentHash: string }>;
}) {
  const { intentHash } = await params;
  const record = CONSOLE_REPLICA_RECORDS_BY_HASH.get(intentHash);

  const subtitle = record
    ? `A ${record.decision.kind} decision on “${record.envelope.kind}” — every section the kernel binds into one tamper-evident receipt.`
    : "The full anatomy of a single receipt — envelope, trace, decision, basis, audit, and cryptographic detail.";

  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · decision"
          title="Decision receipt."
          subtitle={subtitle}
          backHref="/console/audit-explorer"
          backLabel="Back to audit explorer"
        />
        <div className="mt-12">
          <DecisionTraceReplica intentHash={intentHash} />
        </div>
      </Section>
    </main>
  );
}
