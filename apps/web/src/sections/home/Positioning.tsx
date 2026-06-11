import Link from "next/link";
import { Activity, ArrowRight, Share2, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";

/**
 * Each contrast now carries a concrete, same-scenario example so the
 * difference is felt, not asserted (AUDIT P1, content). A semantic icon and a
 * faint decision-colour tint (≈6% opacity) add scannable visual weight (AUDIT
 * P1, visual): EXECUTE-green for observability, REFUSE-red for gateways,
 * ESCALATE-violet for middleware — hinting at the outcome each category lives
 * closest to. Cards cascade in on scroll via the motion kit; the tint and icon
 * are static. The hairline `gap-px` grid is preserved by rendering the Stagger
 * as `display:contents`.
 */
const CONTRASTS = [
  {
    others: "Observability & tracing",
    examples: "Langfuse, OpenTelemetry",
    icon: Activity,
    tint: "bg-execute/[0.06]",
    accent: "text-execute",
    adjudicate:
      "Langfuse logs what happened after execution. Adjudicate intercepts before — so you can rewrite or block.",
    example:
      "Same 100% production ramp: Langfuse records that it shipped; adjudicate caps it to 25% first.",
  },
  {
    others: "LLM gateways",
    examples: "Portkey",
    icon: Share2,
    tint: "bg-refuse/[0.06]",
    accent: "text-refuse",
    adjudicate:
      "Gateways route and rate-limit requests. Adjudicate is policy, governance, and audit at the decision point.",
    example:
      "A pipe-to-shell tool call: a gateway forwards it; adjudicate refuses it and records a typed reason.",
  },
  {
    others: "Custom middleware",
    examples: "Hand-rolled guards",
    icon: Wrench,
    tint: "bg-escalate/[0.06]",
    accent: "text-escalate",
    adjudicate:
      "Hand-rolled guards drift and rot. Adjudicate is a deterministic, replayable, hash-chained kernel you don't maintain forever.",
    example:
      "An ambiguous refund: your glue silently allows it; adjudicate escalates it to a human and seals the trail.",
  },
] as const;

export function Positioning() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Where it fits"
        title="A decision point, not another log."
        subtitle="Observability tells you what happened after the fact. Adjudicate sits on the path from intent to execution and produces the outcome itself — every time, the same way."
        align="center"
      />

      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-edge bg-edge md:grid-cols-3">
        <Stagger className="contents" stagger={0.1}>
          {CONTRASTS.map((contrast) => (
            <PositioningCard key={contrast.others} contrast={contrast} />
          ))}
        </Stagger>
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="/comparisons"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:underline"
        >
          See the full comparison — including OPA &amp; Cedar
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </Section>
  );
}

function PositioningCard({
  contrast,
}: {
  readonly contrast: {
    readonly others: string;
    readonly examples: string;
    readonly icon: LucideIcon;
    readonly tint: string;
    readonly accent: string;
    readonly adjudicate: string;
    readonly example: string;
  };
}) {
  const Icon = contrast.icon;
  return (
    <StaggerItem className="bg-surface">
      <div className={cn("flex h-full flex-col gap-3 p-6", contrast.tint)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-section text-muted">
              vs {contrast.others}
            </span>
            <span className="font-mono text-xs text-muted">
              {contrast.examples}
            </span>
          </div>
          <Icon
            size={20}
            aria-hidden
            className={cn("mt-0.5 shrink-0", contrast.accent)}
          />
        </div>
        <p className="text-sm leading-relaxed text-ink">
          {contrast.adjudicate}
        </p>
        <p className="mt-auto border-t border-edge/70 pt-3 text-[13px] leading-relaxed text-muted">
          {contrast.example}
        </p>
      </div>
    </StaggerItem>
  );
}
