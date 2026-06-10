import { ArrowUpRight, FlaskConical, Package, Sparkles } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CAPABILITIES } from "@/content/capabilities";
import type { Recipe } from "@/content/recipes";
import { WorkedOutcome } from "@/components/recipes/WorkedOutcome";

/**
 * RecipeLayout — the Guardrail-Recipe page body. SERVER component, mirroring
 * CapabilityPageLayout's structure top to bottom:
 *
 *   1. DepthHeader (back to /recipes) — the solution-phrased title + the
 *      problem as subtitle, plus the guard/pack + outcome + live/illustrative
 *      badges.
 *   2. "The problem" — the problem prose, restated as the lede.
 *   3. "The guard" — the npm package + a copyable CodeBlock of the REAL guard
 *      factory / pack snippet.
 *   4. "The outcome" — the live kernel run (or described illustrative outcome)
 *      via <WorkedOutcome>.
 *   5. "Try it" — a CTA into /playground.
 *   6. "Related" — a row linking the related capability / console / transparency
 *      routes.
 *
 * Reveal wraps each block so it settles in on scroll; Stagger drives the
 * Related grid. Both are reduced-motion-safe.
 */
export function RecipeLayout({ recipe }: { readonly recipe: Recipe }) {
  const isLive = recipe.live !== null;
  const playgroundHref = `/playground?intent=${encodeURIComponent(recipe.intentKind)}`;

  return (
    <main>
      <DepthHeader
        eyebrow="Guardrail recipe"
        title={recipe.title}
        subtitle={recipe.seoDescription}
        backHref="/recipes"
        backLabel="Back to recipes"
      />

      <Section className="pt-8 md:pt-12">
        <div className="flex flex-col gap-16">
          {/* Badges. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{recipe.guardOrPack.npmPackage}</Badge>
            <Badge tone={isLive ? "shipped" : "roadmap"}>
              {isLive ? "Live · real kernel" : "Illustrative"}
            </Badge>
            <DecisionChip kind={recipe.outcome} size="sm" />
          </div>

          {/* The problem. */}
          <Reveal>
            <Block id="problem" title="The problem">
              <p className="max-w-3xl text-base leading-relaxed text-muted">
                {recipe.problem}
              </p>
            </Block>
          </Reveal>

          {/* The guard. */}
          <Reveal>
            <Block
              id="the-guard"
              title="The guard"
              subtitle="A real, minimal guard you drop into a policy bundle — accurate to the published package API."
            >
              <div className="flex flex-col gap-4">
                <InstallCard npmPackage={recipe.guardOrPack.npmPackage} />
                <CodeBlock
                  code={recipe.codeSnippet}
                  language="typescript"
                  copyable
                />
              </div>
            </Block>
          </Reveal>

          {/* The outcome. */}
          <Reveal>
            <Block
              id="the-outcome"
              title="The outcome"
              subtitle={
                isLive
                  ? "The real kernel, run server-side at render time — not a mock."
                  : "The decision this guard produces, described from the pack's policy (this pack isn't in the web playground)."
              }
            >
              <WorkedOutcome recipe={recipe} />
            </Block>
          </Reveal>

          {/* Try it. */}
          <Reveal>
            <Block
              id="try-it"
              title="Try it"
              subtitle="Run this guard against your own payload in the interactive playground."
            >
              <a
                href={playgroundHref}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30"
              >
                <FlaskConical size={15} aria-hidden="true" />
                Try it in the playground
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </Block>
          </Reveal>

          {/* Related. */}
          <RelatedRow recipe={recipe} />
        </div>
      </Section>
    </main>
  );
}

/* ── building blocks ───────────────────────────────────────────────────── */

function Block({
  id,
  title,
  subtitle,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-5">
      <div>
        <h2 className="text-h3 text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-1 max-w-measure text-body-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function InstallCard({ npmPackage }: { readonly npmPackage: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-edge bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-section text-muted">
        <Package size={13} aria-hidden="true" />
        Install
      </span>
      <CodeBlock code={`pnpm add ${npmPackage}`} copyable />
    </div>
  );
}

/* ── related row ───────────────────────────────────────────────────────── */

function RelatedRow({ recipe }: { readonly recipe: Recipe }) {
  const capability = recipe.relatedCapabilitySlug
    ? CAPABILITIES.find((c) => c.slug === recipe.relatedCapabilitySlug)
    : undefined;

  const links: Array<{
    href: string;
    eyebrow: string;
    primary: string;
    secondary: string;
    icon: typeof Sparkles;
  }> = [];

  if (capability) {
    links.push({
      href: `/capabilities/${capability.slug}`,
      eyebrow: "Related capability",
      primary: capability.name,
      secondary: capability.oneLiner,
      icon: Sparkles,
    });
  }
  if (recipe.relatedConsoleRoute) {
    links.push({
      href: recipe.relatedConsoleRoute,
      eyebrow: "In the console",
      primary: "Operator console",
      secondary: recipe.relatedConsoleRoute,
      icon: ArrowUpRight,
    });
  }
  if (recipe.relatedTransparencyRoute) {
    links.push({
      href: recipe.relatedTransparencyRoute,
      eyebrow: "Public data",
      primary: "Transparency view",
      secondary: recipe.relatedTransparencyRoute,
      icon: ArrowUpRight,
    });
  }

  if (links.length === 0) {
    return (
      <Reveal>
        <Block id="related" title="Related">
          <Callout tone="info">
            Browse the full capability catalogue to see how this guard composes
            with the rest of the kernel.
          </Callout>
        </Block>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <Block
        id="related"
        title="Related"
        subtitle="Where this recipe connects to the rest of the system."
      >
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <StaggerItem key={`${link.eyebrow}-${link.href}`}>
              <a
                href={link.href}
                className="group flex h-full flex-col gap-2 rounded-xl border border-edge bg-surface p-5 transition-colors hover:border-ink/30"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-section text-muted">
                    <link.icon size={13} aria-hidden="true" />
                    {link.eyebrow}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-faint transition-colors group-hover:text-ink"
                    aria-hidden="true"
                  />
                </div>
                <span className="text-base font-semibold text-ink">
                  {link.primary}
                </span>
                <span className="text-sm text-muted">{link.secondary}</span>
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      </Block>
    </Reveal>
  );
}
