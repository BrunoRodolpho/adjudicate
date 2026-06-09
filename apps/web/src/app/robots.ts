import type { MetadataRoute } from "next";

/** Absolute origin, mirroring `metadataBase` in `app/layout.tsx`. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:5181";

/**
 * Robots policy: allow all crawlers across the whole site and point them at the
 * sitemap. The site is fully public marketing/transparency content — nothing is
 * gated — so there is no disallow list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
