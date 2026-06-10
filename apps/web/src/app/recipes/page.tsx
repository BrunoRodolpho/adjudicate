import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { DepthHeader } from "@/components/ui/DepthHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
import { DecisionFan } from "@/components/DecisionFan";
import { BrandGlow } from "@/components/ui/BrandGlow";
import { RECIPES, type Recipe } from "@/content/recipes";

const TITLE = "Guardrail Recipes · adjudicate";
const DESCRIPTION =
  "Solution-focused patterns: how to stop an AI agent from over-refunding, block dangerous commands, redact PII, cap token spend, pause for human approval and more — each with a real guard, code, and a live kernel outcome.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og-homepage.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-homepage.png"],
  },
};

/**
 * One recipe card: the solution-phrased title, the problem it solves, the
 * outcome decision chip, and the package that delivers it. Links to the full
 * /recipes/[slug] deep-dive. HoverLift gives the interactive affordance
 * (reduced-motion-safe); the Card supplies the border + base hover.
 */
function RecipeCard({ recipe }: { readonly recipe: Recipe }) {
  const isLive = recipe.live !== null;
  return (
    <StaggerItem>
      <HoverLift className="h-full">
        <Card
          href={`/recipes/${recipe.slug}`}
          className="flex h-full flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Badge tone={isLive ? "shipped" : "roadmap"}>
              {isLive ? "Live · real kernel" : "Illustrative"}
            </Badge>
            <DecisionChip kind={recipe.outcome} size="sm" />
          </div>

          <div>
            <h3 className="text-base font-semibold leading-tight text-ink">
              {recipe.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {recipe.problem}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-1">
            <Badge tone="neutral">{recipe.guardOrPack.npmPackage}</Badge>
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-section text-muted">
              Open recipe
              <ArrowRight size={12} aria-hidden="true" />
            </p>
          </div>
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}

/**
 * /recipes — the Guardrail Recipes index. Each entry in {@link RECIPES} is a
 * solution-phrased, SEO-targeted use-case ("how to stop an AI agent from
 * over-refunding"): the problem → the guard/pack that solves it → a real code
 * snippet → the live (or illustrative) kernel outcome on its deep-dive page.
 *
 * Reveal settles the header in; Stagger + HoverLift drive the card grid. All
 * three are reduced-motion-safe.
 */
export default function RecipesPage() {
  return (
    <main>
      <Section>
        <Reveal>
          <DepthHeader
            eyebrow="Recipes"
            title={
              <>
                Guardrail{" "}
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  recipes
                </span>{" "}
                — solution-focused patterns
              </>
            }
            subtitle="Each recipe answers a single how-do-I question: the problem, the guard or pack that solves it, a real code snippet, and the outcome the kernel actually reaches — run server-side through the real kernel where the pack is installed, or clearly labelled illustrative where it isn't."
            backHref="/"
            backLabel="Back to home"
          />
        </Reveal>

        <div className="relative mt-10 overflow-hidden rounded-2xl border border-edge bg-surface px-6 py-10">
          <BrandGlow />
          <div className="relative z-10 mx-auto max-w-4xl">
            <p className="mb-5 text-center text-eyebrow uppercase text-muted">
              Every recipe resolves to one of six signed decisions
            </p>
            <div className="overflow-x-auto">
              <DecisionFan className="h-auto w-full min-w-[600px]" />
            </div>
          </div>
        </div>

        <Stagger className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RECIPES.map((recipe) => (
            <RecipeCard key={recipe.slug} recipe={recipe} />
          ))}
        </Stagger>
      </Section>
    </main>
  );
}
