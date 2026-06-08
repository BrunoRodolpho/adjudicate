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
  openGraph: {
    title: "Console · adjudicate",
    description:
      "Interactive replicas of the adjudicate operator console, driven by committed sample data.",
    type: "website",
    images: [{ url: "/og-console.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-console.png"],
  },
};

/**
 * The ten operator-console replicas, grouped by the surface they mirror. The
 * decision-detail link targets a REAL, verifiable sample intentHash (imported
 * from the committed replica fixtures, so it can never drift from the records
 * the route renders) rather than a hand-typed string. Every other route maps to
 * a `/console/<view>` replica whose `<view>` matches the real console route
 * (apps/console/src/app/<view>). Dark (console) tone throughout — Cards carry
 * console.* dark-token overrides so they read as operator surfaces on the
 * zinc-950 Section.
 */
const REPLICA_GROUPS: ReadonlyArray<{
  readonly heading: string;
  readonly description: string;
  readonly replicas: ReadonlyArray<{
    readonly href: string;
    readonly title: string;
    readonly blurb: string;
  }>;
}> = [
  {
    heading: "Live feed",
    description:
      "The adjudicated decision stream as an operator watches it land.",
    replicas: [
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
    ],
  },
  {
    heading: "Analytics",
    description:
      "Aggregate signal charted from the sample decision feed.",
    replicas: [
      {
        href: "/console/dashboard",
        title: "Dashboard",
        blurb:
          "Outcome distribution across the six decision kinds, charted from the sample decision feed.",
      },
      {
        href: "/console/drift",
        title: "Drift",
        blurb:
          "Decision-mix drift over time — how the balance of executes, refusals, and escalations shifts across the window.",
      },
      {
        href: "/console/tokens",
        title: "Tokens",
        blurb:
          "Token-usage burndown against tenant budgets, tracking spend trends without exposing prompt or completion text.",
      },
    ],
  },
  {
    heading: "Governance",
    description:
      "The control surfaces that keep autonomous systems accountable.",
    replicas: [
      {
        href: "/console/red-team",
        title: "Red team",
        blurb:
          "Adversarial-probe run history and pass/fail trend across the simulated red-team suite.",
      },
      {
        href: "/console/ai-bom",
        title: "AI BOM",
        blurb:
          "The AI bill of materials — models, packs, and tools in play, with their declared provenance.",
      },
      {
        href: "/console/integrity",
        title: "Integrity",
        blurb:
          "The tamper-evident audit chain — hash links verified end to end so no record can be silently altered.",
      },
      {
        href: "/console/approvals",
        title: "Approvals",
        blurb:
          "The approval center — pending decisions, decision history, and the audit chain behind each sign-off.",
      },
      {
        href: "/console/command-risk",
        title: "Command risk",
        blurb:
          "Command-risk aggregation by category — destructive, credential, and network counts only; never the command text.",
      },
    ],
  },
];

/**
 * /console — gallery hub for the operator-console replicas. Opens with the
 * ConsoleTailLoop video (the operator console, alive) framed as an illustrative
 * loop, frames the whole surface as committed sample data (never live), then
 * lists all ten replicas grouped by surface. Dark (console) tone.
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

        {/* The operator console, alive. A plain looping clip (no controls,
            muted, autoplay) so the hub opens on motion rather than a static
            grid. No poster is shipped for this clip, so the attribute is
            omitted. Server-renderable — no client interactivity. */}
        <figure className="mt-10 overflow-hidden rounded-2xl border border-console-edge bg-console-panel shadow-lg">
          <video
            src="/console-tail.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-label="An illustrative loop of the operator console with adjudicated decisions tailing in."
            className="block h-auto w-full bg-console-panel"
          />
          <figcaption className="border-t border-console-edge px-4 py-2.5 text-xs text-zinc-500">
            Illustrative loop · the operator console with decisions tailing in.
          </figcaption>
        </figure>

        <p className="mt-10 max-w-2xl text-base leading-relaxed text-zinc-400">
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

        <div className="mt-12 flex flex-col gap-12">
          {REPLICA_GROUPS.map((group) => (
            <section key={group.heading} aria-labelledby={`group-${group.heading}`}>
              <h2
                id={`group-${group.heading}`}
                className="text-xs font-semibold uppercase tracking-section text-zinc-500"
              >
                {group.heading}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
                {group.description}
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {group.replicas.map((replica) => (
                  <Card
                    key={replica.href}
                    href={replica.href}
                    className="group border-console-edge bg-console-panel hover:border-console-muted/50"
                  >
                    <h3 className="flex items-center gap-1.5 text-base font-semibold text-zinc-100">
                      {replica.title}
                      <ArrowRight
                        size={16}
                        className="text-zinc-500 transition-colors group-hover:text-zinc-100"
                        aria-hidden="true"
                      />
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                      {replica.blurb}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>
    </main>
  );
}
