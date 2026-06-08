import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

const CONTRASTS = [
  {
    others: "Observability & tracing",
    examples: "Langfuse, OpenTelemetry",
    adjudicate:
      "Adjudicate decides — and can block or rewrite the action, not just observe it.",
  },
  {
    others: "LLM gateways",
    examples: "Portkey",
    adjudicate:
      "Policy, governance, and audit at the decision point — not request routing.",
  },
  {
    others: "Custom middleware",
    examples: "Hand-rolled guards",
    adjudicate:
      "A deterministic, replayable, hash-chained kernel — not glue you maintain forever.",
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
        {CONTRASTS.map((contrast) => (
          <div key={contrast.others} className="flex flex-col gap-3 bg-surface p-6">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-section text-muted">
                vs {contrast.others}
              </span>
              <span className="font-mono text-xs text-faint">
                {contrast.examples}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink">
              {contrast.adjudicate}
            </p>
          </div>
        ))}
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
