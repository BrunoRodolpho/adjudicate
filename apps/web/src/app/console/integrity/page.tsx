import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { ConfigIntegrityReplica } from "@/components/console-tour/ConfigIntegrityReplica";

export const metadata: Metadata = {
  title: "Configuration integrity · adjudicate",
  description:
    "Configuration-integrity replica — active seals, integrity violations, and kill-switch activation stability over committed sample data.",
};

/**
 * /console/integrity — the Configuration Integrity operator-console replica
 * (ADR-131).
 *
 * Renders the {@link ConfigIntegrityReplica}: a static mirror of the console's
 * three integrity panels (active seals, seal violations, kill-switch activation
 * timeline) inside the ConsoleChrome honesty boundary, driven by the committed
 * `INTEGRITY_REPLICA_FIXTURE`. All digests are illustrative placeholders. apps/web
 * reads no DATABASE_URL/REDIS_URL/admin token and fetches no /api/admin or SSE.
 * Dark (console) tone.
 */
export default function ConsoleIntegrityPage() {
  return (
    <main>
      <Section tone="console">
        <DepthHeader
          eyebrow="Console · configuration integrity"
          title="Configuration integrity."
          subtitle="A faithful replica of the operator console's integrity surface — per-pack seals, structured violations, and kill-switch activation stability — over committed sample data."
          backHref="/console"
          backLabel="Back to console"
        />
        <div className="mt-12">
          <ConfigIntegrityReplica />
        </div>
      </Section>
    </main>
  );
}
