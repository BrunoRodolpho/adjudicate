import { ArrowUpRight, FlaskConical, Package, Sparkles } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Code } from "@/components/blog/Code";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CAPABILITIES } from "@/content/capabilities";
import type { Recipe } from "@/content/recipes";
import { WorkedOutcome } from "@/components/recipes/WorkedOutcome";

/**
 * RecipeLayout — the Guardrail-Recipe page body. SERVER component, sharing the
 * capability deep-dive's tonal-band composition so a long recipe gains pacing
 * instead of reading as one flat code-heavy scroll (the R4 re-score's note on
 * the recipe cluster):
 *
 *   1. DepthHeader (canvas) — solution-phrased title + SEO standfirst + back.
 *   2. INTRO band (surface) — guard/pack + outcome badges, and "the problem"
 *      as a measured editorial lead.
 *   3. GUARD + OUTCOME band (canvas) — the install + real guard snippet and the
 *      live/illustrative kernel outcome: the technical payoff, on its own band.
 *   4. TRY IT + RELATED band (surface) — a filled "run it yourself" CTA card
 *      (previously a thin lone button) and the related-routes grid.
 *
 * Cards sit a tone above their band (bg-canvas on surface, bg-surface on canvas)
 * and lift on shadow, not a hairline border.
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

      {/* ── Intro band ─────────────────────────────────────────────────── */}
      <Section tone="surface" className="pt-8 md:pt-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{recipe.guardOrPack.npmPackage}</Badge>
            <Badge tone={isLive ? "shipped" : "roadmap"}>
              {isLive ? "Live · real kernel" : "Illustrative"}
            </Badge>
            <DecisionChip kind={recipe.outcome} size="sm" />
          </div>
          <Reveal>
            <section id="problem">
              <h2 className="text-eyebrow uppercase tracking-section text-brand-ink">
                The problem
              </h2>
              <p className="mt-3 max-w-measure text-lead leading-relaxed text-muted-strong">
                {recipe.problem}
              </p>
            </section>
          </Reveal>
        </div>
      </Section>

      {/* ── Guard + outcome band (technical payoff) ────────────────────── */}
      <Section tone="canvas">
        <div className="flex flex-col gap-16">
          <Reveal>
            <Block
              id="the-guard"
              title="The guard"
              subtitle="A real, minimal guard you drop into a policy bundle — accurate to the published package API."
            >
              <div className="flex flex-col gap-4">
                <InstallCard npmPackage={recipe.guardOrPack.npmPackage} />
                <Code
                  code={recipe.codeSnippet}
                  lang="ts"
                  copyable
                  className="my-0"
                />
              </div>
            </Block>
          </Reveal>

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
        </div>
      </Section>

      {/* ── Try it + related band ──────────────────────────────────────── */}
      <Section tone="surface">
        <div className="flex flex-col gap-16">
          <Reveal>
            <Block id="try-it" title="Try it">
              <div className="flex flex-col gap-4 rounded-xl bg-canvas p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-measure text-sm leading-relaxed text-muted">
                  Run this guard against your own payload in the interactive
                  playground — watch the kernel reach this outcome live, with a
                  signed receipt.
                </p>
                <a
                  href={playgroundHref}
                  className="focus-ring inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-xs transition-shadow hover:shadow-sm"
                >
                  <FlaskConical size={15} aria-hidden="true" />
                  Try it in the playground
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </Block>
          </Reveal>

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
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-xs">
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
                className="focus-ring group flex h-full flex-col gap-2 rounded-xl bg-canvas p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-section text-muted">
                    <link.icon size={13} aria-hidden="true" />
                    {link.eyebrow}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-faint transition-colors group-hover:text-brand-ink"
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
