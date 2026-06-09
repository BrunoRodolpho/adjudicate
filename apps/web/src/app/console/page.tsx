import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
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
          "Every receipt, newest-first. Watch decisions land in real time as your system adjudicates them, then drill into any one for its full anatomy.",
      },
      {
        href: `/console/decision/${DEPLOYMENT_ROLLBACK_RESUMED_HASH}`,
        title: "Decision detail",
        blurb:
          "Open one receipt end to end: the envelope it acted on, the basis for the decision, the plan, the supersession chain, and the tamper-evident hashes that prove none of it was altered.",
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
          "See the shape of every decision at a glance. Outcome distribution across the six kinds, plus the rejection codes cited most — so you know what your system blocks and why.",
      },
      {
        href: "/console/drift",
        title: "Drift",
        blurb:
          "Catch behaviour changing before it becomes an incident. Track how the balance of executes, refusals, and escalations shifts over time, with an alert when a dimension moves too far from baseline.",
      },
      {
        href: "/console/tokens",
        title: "Tokens",
        blurb:
          "Keep spend inside its budget. Watch tenant and session token burn-down, spot who is near or over their cap, and review every budget crossing — never any prompt or completion text.",
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
          "Know your guards still hold. Adversarial-probe runs report how many attacks were defended versus escaped, with a pass/fail trend so a regression shows up the moment it lands.",
      },
      {
        href: "/console/ai-bom",
        title: "AI BOM",
        blurb:
          "Answer 'what is actually running?' for any pack. The AI bill of materials lists the model, tools, vector stores, prompt hashes, and guardrails in play — provenance you can attest.",
      },
      {
        href: "/console/integrity",
        title: "Integrity",
        blurb:
          "Prove configuration hasn't drifted. Per-pack seals verify each pack still matches what was signed, and the kill-switch timeline shows every activation — so nothing changes silently.",
      },
      {
        href: "/console/approvals",
        title: "Approvals",
        blurb:
          "Put a human in the loop on risky actions. Review the pending-confirmation queue, the resolved decision history, and the full audit chain behind each sign-off.",
      },
      {
        href: "/console/command-risk",
        title: "Command risk",
        blurb:
          "Watch shell-command risk without ever seeing a command. Counts by category — destructive, credential, network — and dispositions, so you can act on the pattern, never the payload.",
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
          These replicas mirror the real operator console&apos;s interface and
          workflows, driven by committed sample data so you can explore every
          surface without a live system. The real console reads live operator
          data from Postgres + Redis — see the{" "}
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
            <Reveal key={group.heading}>
              <section aria-labelledby={`group-${group.heading}`}>
                <h2
                  id={`group-${group.heading}`}
                  className="text-xs font-semibold uppercase tracking-section text-zinc-500"
                >
                  {group.heading}
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">
                  {group.description}
                </p>
                <Stagger className="mt-5 grid gap-4 md:grid-cols-3">
                  {group.replicas.map((replica) => (
                    <StaggerItem key={replica.href}>
                      <HoverLift className="h-full rounded-xl">
                        <Card
                          href={replica.href}
                          className="group h-full border-console-edge bg-console-panel hover:border-console-muted/50"
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
                      </HoverLift>
                    </StaggerItem>
                  ))}
                </Stagger>
              </section>
            </Reveal>
          ))}
        </div>
      </Section>
    </main>
  );
}
