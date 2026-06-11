import { HoverLift } from "@/components/motion/HoverLift";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * Each audience card now carries an outcome-first value prop plus a concrete,
 * named example so a visitor can place their own context (AUDIT P1, content).
 * Cards cascade in on scroll and lift on hover; the role eyebrow lightens
 * (text-muted → text-ink) on hover as an interaction affordance. All motion is
 * transform/opacity-only and reduced-motion-safe via the motion kit; the
 * eyebrow shift is a pure CSS group-hover colour change.
 */
const AUDIENCES = [
  {
    title: "AI Platform Teams",
    prop: "Put a single, deterministic guard between every model and every side-effect.",
    example:
      "An HR assistant routes every employee-data query through one adjudicate instance — approve, rewrite to redact, or escalate.",
  },
  {
    title: "Agent Builders",
    prop: "Ship agents that can act, because each tool call is adjudicated and recorded.",
    example:
      "A deploy agent proposes a 100% production rollout; the kernel rewrites it to a 25% staged ramp before anything ships.",
  },
  {
    title: "Regulated Industries",
    prop: "Prove what was decided and why with a hash-chained, replayable audit trail.",
    example:
      "A bank replays last quarter's refund decisions from signed receipts — same inputs, same outcomes, byte-for-byte.",
  },
  {
    title: "Internal Governance Programs",
    prop: "Encode policy as code and give operators one place to see every decision.",
    example:
      "Security writes one guard for destructive commands; every team inherits it, and ops watches the refusals in the console.",
  },
] as const;

export function WhoItsFor() {
  return (
    <Section tone="surface">
      <SectionHeading
        eyebrow="Audience"
        title="Who is this for?"
        subtitle="Anyone who needs an LLM to take action — without taking it on faith."
        align="center"
      />

      <Stagger
        as="div"
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {AUDIENCES.map((audience) => (
          <StaggerItem key={audience.title} className="h-full">
            <HoverLift className="h-full rounded-xl" lift={6}>
              <Card className="group flex h-full flex-col gap-2">
                <h3 className="text-base font-semibold text-ink">
                  {audience.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {audience.prop}
                </p>
                <p className="mt-auto border-t border-edge pt-3 text-[13px] leading-relaxed text-muted transition-colors group-hover:text-ink">
                  <span className="font-medium text-muted transition-colors group-hover:text-ink/80">
                    Example ·{" "}
                  </span>
                  {audience.example}
                </p>
              </Card>
            </HoverLift>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
