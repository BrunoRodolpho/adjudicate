import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatTile } from "@/components/ui/StatTile";
import { STATS } from "@/content/stats.generated";

/**
 * Countable proof comes straight from the generated stats module — these
 * numbers must NEVER be hardcoded here. The two trailing claims are
 * non-countable guarantees that describe the kernel itself.
 */
const COUNTED = [
  { value: STATS.packages, label: "packages" },
  { value: STATS.adrs, label: "ADRs" },
  { value: STATS.tests, label: "tests" },
  { value: STATS.capabilities, label: "capabilities" },
  { value: STATS.outcomes, label: "decision outcomes" },
] as const;

const CLAIMS = [
  { value: "✓", label: "deterministic replay" },
  { value: "✓", label: "hash-chained audit" },
] as const;

export function SocialProof() {
  return (
    <Section tone="surface">
      <SectionHeading
        eyebrow="Built in the open"
        title="A real kernel, not a pitch deck."
        subtitle="Every number below is counted from this repository at build time."
        align="center"
      />

      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-7">
        {COUNTED.map((stat) => (
          <StatTile
            key={stat.label}
            value={stat.value}
            label={stat.label}
            className="items-center text-center"
          />
        ))}
        {CLAIMS.map((claim) => (
          <StatTile
            key={claim.label}
            value={claim.value}
            label={claim.label}
            className="items-center text-center [&>span:first-child]:text-execute"
          />
        ))}
      </dl>
    </Section>
  );
}
