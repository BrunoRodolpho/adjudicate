import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { StepStrip } from "@/components/ui/StepStrip";
import { DataFlowDiagram } from "@/components/architecture/DataFlowDiagram";
import { TrustBoundaryPanel } from "@/components/architecture/TrustBoundaryPanel";
import { IntentAuthFlow } from "@/components/home/IntentAuthFlow";

export const metadata: Metadata = {
  title: "Data flow · adjudicate",
  description:
    "The end-to-end data flow: an AI agent's intent is adjudicated in-process, the decision is folded into a tamper-evident AuditRecord, mirrored to a partitioned Postgres table, and pushed over Redis + SSE to the operator console's live tail.",
  openGraph: {
    title: "Data flow · adjudicate",
    description:
      "The end-to-end data flow: an AI agent's intent is adjudicated in-process, the decision is folded into a tamper-evident AuditRecord, mirrored to a partitioned Postgres table, and pushed over Redis + SSE to the operator console's live tail.",
    type: "website",
    images: [{ url: "/og-data-flow.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-data-flow.png"],
  },
};

/**
 * /architecture/data-flow — the data-architecture story.
 *
 * Traces a single decision from an AI agent's intent through the in-process
 * adjudicate() kernel, into a durable AuditRecord, and out to its two
 * destinations: the partitioned Postgres mirror and the real-time Redis →
 * SSE → console live tail. Then it draws the trust boundary that makes the
 * public site (apps/web) safe by construction: it holds no database or Redis
 * credentials at all.
 *
 * Every node and column is annotated with the real package / source file, so
 * a reader can follow each claim straight into the repo.
 */
export default function ArchitectureDataFlowPage() {
  return (
    <main>
      <DepthHeader
        eyebrow="Architecture · data flow"
        title="How a decision becomes a durable receipt."
        subtitle="An AI acts, the kernel decides in-process, and the decision is folded into a tamper-evident record — mirrored to Postgres and pushed live to the operator console. Every step maps to a real source file."
        backHref="/architecture"
        backLabel="Back to architecture"
      />

      <Section tone="console" className="pt-10">
        <StepStrip className="mb-12" />

        <div>
          <h2 className="text-xs uppercase tracking-section text-console-muted">
            The pipeline
          </h2>
          <p className="mt-2 max-w-3xl text-base text-console-muted">
            adjudicate is a library, not a service. There is no separate
            gateway or proxy — the kernel runs in-process, deciding before any
            side effect. What follows is the journey of exactly one decision,
            from the agent&apos;s intent to the receipt an operator can replay.
          </p>
          <IntentAuthFlow className="mt-8" />
          <DataFlowDiagram className="mt-8" />
        </div>
      </Section>

      <Section tone="console">
        <h2 className="text-xs uppercase tracking-section text-console-muted">
          The trust boundary
        </h2>
        <p className="mt-2 max-w-3xl text-base text-console-muted">
          The console reads the real database and the live bus. This public site
          reads neither. That separation is deliberate — and it is what makes a
          public governance surface safe to publish at all.
        </p>
        <TrustBoundaryPanel className="mt-8" />
      </Section>

      <Section tone="console" className="py-16">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-console-edge bg-console-panel p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-console-ink">
              Want to stand this up yourself?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-console-muted">
              The console and its Postgres mirror are open source. See how the
              pieces wire together in a real deployment — library / in-process,
              self-hosted console.
            </p>
          </div>
          <Link
            href="/deploy"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md"
          >
            How to deploy adjudicate
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </Section>
    </main>
  );
}
