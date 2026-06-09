import { ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { HoverLift } from "@/components/motion/HoverLift";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Card } from "@/components/ui/Card";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { RECIPES } from "@/content/recipes";

/**
 * RecipesTeaser — homepage band that surfaces the Guardrail Recipes section: a
 * library of copy-paste guard patterns for concrete, named risks (over-refund,
 * PII, token spend, prod deploys). Each featured card carries the recipe's
 * solution-phrased title, the problem it solves, and its outcome chip, linking
 * to the full /recipes/<slug> page; a trailing link browses the whole catalogue.
 *
 * Server component. Motion is reduced-motion-safe via the kit: cards cascade in
 * on scroll (Stagger) and lift on hover (HoverLift, transform/opacity-only), and
 * the title eyebrow lightens on hover as a pure CSS group-hover affordance.
 *
 * Featured slugs are pinned (not sliced by index) so the teaser stays stable as
 * RECIPES grows; each is a LIVE recipe with a concrete, real-kernel outcome.
 */
const FEATURED_SLUGS = [
  "over-refund-clamp",
  "redact-pii",
  "cap-token-spend",
  "gate-prod-deploys",
] as const;

const FEATURED = FEATURED_SLUGS.map((slug) => {
  const recipe = RECIPES.find((r) => r.slug === slug);
  if (!recipe) {
    throw new Error(`RecipesTeaser: featured recipe "${slug}" not found in RECIPES.`);
  }
  return recipe;
});

export function RecipesTeaser() {
  return (
    <Section tone="canvas">
      <SectionHeading
        eyebrow="Guardrail recipes"
        title="Copy-paste patterns for real risks"
        subtitle="Each recipe pairs a concrete failure mode with the exact guard that stops it — a real code snippet and the live decision the kernel reaches."
        align="center"
      />

      <Stagger
        as="div"
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {FEATURED.map((recipe) => (
          <StaggerItem key={recipe.slug} className="h-full">
            <HoverLift className="h-full rounded-xl" lift={6}>
              <Card
                href={`/recipes/${recipe.slug}`}
                className="group flex h-full flex-col gap-3"
              >
                <DecisionChip kind={recipe.outcome} size="sm" />
                <h3 className="text-base font-semibold leading-snug text-ink">
                  {recipe.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {recipe.problem}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-[13px] font-medium text-faint transition-colors group-hover:text-ink">
                  Read the recipe
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </Card>
            </HoverLift>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-10 flex justify-center">
        <Link
          href="/recipes"
          className="group inline-flex items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30"
        >
          <BookOpen size={15} aria-hidden="true" />
          Browse all recipes
          <ArrowRight
            size={15}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </Section>
  );
}
