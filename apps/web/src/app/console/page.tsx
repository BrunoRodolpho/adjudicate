import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { DEPLOYMENT_ROLLBACK_RESUMED_HASH } from "@/lib/console-replica-records";

export const metadata: Metadata = {
  title: "Console · adjudicate",
  description:
    "Interactive replicas of the adjudicate operator console, driven by committed sample data.",
};

/**
 * The three launch replicas. The decision-detail link targets a REAL, verifiable
 * sample intentHash (imported from the committed replica fixtures, so it can
 * never drift from the records the route renders) rather than a hand-typed
 * string. Dark (console) tone throughout — Cards carry console.* dark-token
 * overrides so they read as operator surfaces on the zinc-950 Section.
 */
const REPLICAS: ReadonlyArray<{
  readonly href: string;
  readonly title: string;
  readonly blurb: string;
}> = [
  {
    href: "/console/audit-explorer",
    title: "Audit Explorer",
    blurb:
      "Every receipt, with a simulated live tail of adjudicated decisions streaming in newest-first.",
  },
  {
    href: `/console/decision/${DEPLOYMENT_ROLLBACK_RESUMED_HASH}`,
    title: "Decision detail",
    blurb:
      "The full anatomy of one receipt — envelope, decision basis, plan, supersession chain, and tamper-evident hashes.",
  },
  {
    href: "/console/dashboard",
    title: "Dashboard",
    blurb:
      "Outcome distribution across the six decision kinds, charted from the sample decision feed.",
  },
];

/**
 * /console — gallery hub for the operator-console replicas. Frames the surface
 * as committed sample data (never live) and links out to the three launch
 * replicas. Dark (console) tone.
 */
export default function ConsolePage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console"
          title="Console replicas."
          subtitle="Interactive replicas of the operator console."
        />

        <p className="mt-8 max-w-2xl text-base leading-relaxed text-zinc-400">
          Interactive replicas of the operator console — driven by committed
          sample data; the real console reads Postgres + Redis. See the{" "}
          <Link
            href="/architecture/data-flow"
            className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 transition-colors hover:text-zinc-50 hover:decoration-zinc-400"
          >
            data flow
          </Link>
          .
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {REPLICAS.map((replica) => (
            <Card
              key={replica.href}
              href={replica.href}
              className="group border-console-edge bg-console-panel hover:border-console-muted/50"
            >
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-zinc-100">
                {replica.title}
                <ArrowRight
                  size={16}
                  className="text-zinc-500 transition-colors group-hover:text-zinc-100"
                  aria-hidden="true"
                />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {replica.blurb}
              </p>
            </Card>
          ))}
        </div>
      </Section>
    </main>
  );
}
