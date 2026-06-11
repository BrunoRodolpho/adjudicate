import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { POSTS } from "@/content/blog";

/**
 * "Latest from the blog" strip — three most recent posts, slotted between
 * the Get Started section and the Final CTA on the homepage.
 */
export function LatestPosts() {
  const top = POSTS.slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section className="bg-canvas py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Latest from the blog
          </h2>
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:text-brand-ink"
          >
            All posts <ArrowRight size={14} />
          </Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {top.map((p) => (
            <li
              key={p.slug}
              className="rounded-xl border border-edge bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <span className="text-xs uppercase tracking-section text-muted">
                {p.date}
              </span>
              <h3 className="mt-1 text-base font-semibold leading-snug text-ink">
                {p.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted">
                {p.summary}
              </p>
              <Link
                href={`/blog/${p.slug}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:text-brand-ink"
              >
                Read post <ArrowRight size={14} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
