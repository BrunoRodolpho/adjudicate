import type { MetadataRoute } from "next";
import { CAPABILITIES } from "@/content/capabilities";
import { POSTS } from "@/content/blog";
import { RECIPES } from "@/content/recipes";

/** Absolute origin, mirroring `metadataBase` in `app/layout.tsx`. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5181";

/**
 * Every crawlable route on the marketing/transparency surface.
 *
 * Static paths are listed explicitly (they correspond to `page.tsx` files on
 * disk); dynamic paths are derived from the same registries the pages render
 * from — capability slugs from `CAPABILITIES`, post slugs from `POSTS` — so a
 * new capability, post or recipe enters the sitemap automatically. Routes
 * behind a dynamic segment with no registry (e.g.
 * `/console/decision/[intentHash]`) are intentionally excluded: they are
 * per-record drill-downs, not stable pages.
 */
const STATIC_PATHS = [
  // ── Top-level marketing + product ──────────────────────────────────────
  "/",
  "/how-it-works",
  "/deploy",
  "/playground",
  "/capabilities",
  "/recipes",
  // ── Console (operator surface index + nine static views) ───────────────
  "/console",
  "/console/ai-bom",
  "/console/approvals",
  "/console/audit-explorer",
  "/console/command-risk",
  "/console/dashboard",
  "/console/drift",
  "/console/integrity",
  "/console/red-team",
  "/console/tokens",
  // ── Architecture ───────────────────────────────────────────────────────
  "/architecture",
  "/architecture/data-flow",
  "/comparisons",
  "/introspection",
  // ── Project (roadmap + contributor onboarding) ─────────────────────────
  "/roadmap",
  "/contribute",
  // ── Transparency (trust hub index + seven sub-views) ───────────────────
  "/transparency",
  "/transparency/ai-bom",
  "/transparency/command-risk",
  "/transparency/drift",
  "/transparency/integrity",
  "/transparency/pii",
  "/transparency/red-team",
  "/transparency/tokens",
  // ── Blog ───────────────────────────────────────────────────────────────
  "/blog",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified,
  }));

  const capabilityEntries: MetadataRoute.Sitemap = CAPABILITIES.map((cap) => ({
    url: new URL(`/capabilities/${cap.slug}`, SITE_URL).toString(),
    lastModified,
  }));

  const recipeEntries: MetadataRoute.Sitemap = RECIPES.map((recipe) => ({
    url: new URL(`/recipes/${recipe.slug}`, SITE_URL).toString(),
    lastModified,
  }));

  const blogEntries: MetadataRoute.Sitemap = POSTS.map((post) => ({
    url: new URL(`/blog/${post.slug}`, SITE_URL).toString(),
    lastModified: new Date(post.date),
  }));

  return [
    ...staticEntries,
    ...capabilityEntries,
    ...recipeEntries,
    ...blogEntries,
  ];
}
