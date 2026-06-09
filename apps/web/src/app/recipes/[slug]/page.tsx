import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RECIPES, recipeBySlug } from "@/content/recipes";
import { RecipeLayout } from "@/components/recipes/RecipeLayout";

/**
 * /recipes/[slug] — the per-recipe deep-dive. One dynamic page renders every
 * entry in {@link RECIPES} through the same {@link RecipeLayout}: the problem →
 * the guard/pack → a real code snippet → the live (or illustrative) kernel
 * outcome → a "try it in the playground" CTA → the related capability/console/
 * transparency links.
 *
 * `generateStaticParams` prebuilds every registry slug, so all recipe pages are
 * static; an unknown slug → notFound().
 */

export function generateStaticParams(): Array<{ slug: string }> {
  return RECIPES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = recipeBySlug(slug);
  if (!recipe) {
    return { title: "Guardrail recipe · adjudicate" };
  }
  const ogImage = "/og-homepage.png";
  return {
    title: recipe.seoTitle,
    description: recipe.seoDescription,
    openGraph: {
      title: recipe.seoTitle,
      description: recipe.seoDescription,
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.seoTitle,
      description: recipe.seoDescription,
      images: [ogImage],
    },
  };
}

export default async function RecipePage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const recipe = recipeBySlug(slug);
  if (!recipe) notFound();

  return <RecipeLayout recipe={recipe} />;
}
