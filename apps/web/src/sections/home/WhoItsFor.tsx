import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

const AUDIENCES = [
  {
    title: "AI Platform Teams",
    prop: "Put a single, deterministic guard between every model and every side-effect.",
  },
  {
    title: "Agent Builders",
    prop: "Ship agents that can act, because each tool call is adjudicated and recorded.",
  },
  {
    title: "Regulated Industries",
    prop: "Prove what was decided and why with a hash-chained, replayable audit trail.",
  },
  {
    title: "Internal Governance Programs",
    prop: "Encode policy as code and give operators one place to see every decision.",
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

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((audience) => (
          <Card key={audience.title} className="flex h-full flex-col gap-2">
            <h3 className="text-base font-semibold text-ink">
              {audience.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted">
              {audience.prop}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
