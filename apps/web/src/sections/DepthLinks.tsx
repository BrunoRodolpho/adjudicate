import Link from "next/link";
import { ArrowRight, Layers, GitCompare, Microscope } from "lucide-react";

/**
 * Three-card "for depth" section signposting the dedicated routes that
 * Phase 5 split off the homepage. Mounted between the playground and
 * the GetStarted/FinalCTA cluster.
 *
 * Audience: visitors who reached the playground already convinced and
 * want to dig deeper into the mechanism, the comparisons, or the
 * introspection tooling.
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
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <DepthCard
            href="/architecture"
            icon={Layers}
            title="Architecture"
            audience="For evaluators"
            description="Why a kernel sits between AI intent and side-effect, and the seven primitives underneath."
          />
          <DepthCard
            href="/comparisons"
            icon={GitCompare}
            title="Comparisons"
            audience="For OPA / Cedar users"
            description="How the six-decision algebra differs from allow/deny — capability by capability."
          />
          <DepthCard
            href="/introspection"
            icon={Microscope}
            title="Introspection"
            audience="For auditors / analyzers"
            description="Programmatic introspection of every guard governing your AI actions, plus the operator console preview."
          />
        </div>
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
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-edge bg-surface p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
    >
      <div className="flex items-center justify-between">
        <Icon size={20} className="text-muted group-hover:text-indigo-600" />
        <span className="text-[10px] uppercase tracking-section text-faint">
          {audience}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{description}</p>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-indigo-600 group-hover:gap-2 transition-all">
        Open <ArrowRight size={12} />
      </span>
    </Link>
  );
}
