import Link from "next/link";
import { ArrowRight, Layers, GitCompare, Microscope } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

/**
 * Three-card "for depth" section signposting the dedicated routes that
 * Phase 5 split off the homepage. Mounted between the playground and
 * the GetStarted/FinalCTA cluster.
 *
 * Audience: visitors who reached the playground already convinced and
 * want to dig deeper into the mechanism, the comparisons, or the
 * introspection tooling.
 *
 * AUDIT P1: each card now states when/why to visit (what you'll find there),
 * the cards cascade in on scroll, and the icon scales + colours on hover. The
 * card lift and icon scale are transform-only and `motion-safe:`-gated so they
 * vanish under reduced motion; the colour shift remains as a static affordance.
 */
export function DepthLinks() {
  return (
    <section className="bg-canvas py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-section text-muted">
            For depth
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Want to look under the hood?
          </h2>
          <p className="mt-3 text-base text-muted">
            Three dedicated routes for the audiences that want more than the homepage.
          </p>
        </div>
        <Stagger as="div" className="mt-10 grid gap-4 md:grid-cols-3">
          <DepthCard
            href="/architecture"
            icon={Layers}
            title="Architecture"
            audience="For evaluators"
            description="Why a kernel belongs between AI intent and side-effect. Walk the seven primitives, the six-decision algebra, and the hash-chained audit model — the case for the design, end to end."
          />
          <DepthCard
            href="/comparisons"
            icon={GitCompare}
            title="Comparisons"
            audience="For OPA / Cedar users"
            description="How the six-decision algebra goes beyond allow/deny, capability by capability. Read this when you already have a policy engine and need to know what rewrite, defer, and escalate buy you."
          />
          <DepthCard
            href="/introspection"
            icon={Microscope}
            title="Introspection"
            audience="For auditors / analyzers"
            description="Query every guard governing your AI actions programmatically, then see them surfaced in the operator console preview. Start here if you need to prove coverage, not just trust it."
          />
        </Stagger>
      </div>
    </section>
  );
}

function DepthCard({
  href,
  icon: Icon,
  title,
  audience,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  audience: string;
  description: string;
}) {
  return (
    <StaggerItem className="h-full">
      <Link
        href={href}
        className="group flex h-full flex-col gap-3 rounded-xl border border-edge bg-surface p-6 shadow-sm transition-all hover:border-brand/40 hover:shadow-lg motion-safe:hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between">
          <Icon
            size={20}
            className="text-muted transition duration-200 group-hover:text-brand-ink motion-safe:group-hover:scale-110"
          />
          <span className="text-[10px] uppercase tracking-section text-muted">
            {audience}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-brand-ink transition-all group-hover:gap-2">
          Open <ArrowRight size={12} />
        </span>
      </Link>
    </StaggerItem>
  );
}
