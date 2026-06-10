import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Rss } from "lucide-react";
import { POSTS } from "@/content/blog";
import {
  RevealGrid,
  RevealGridItem,
} from "@/components/transparency/RevealGrid";

const BLOG_TITLE = "adjudicate · blog";
const BLOG_DESCRIPTION =
  "Notes from the kernel — engineering and design writing on guardrails for AI agents, the six decision outcomes, and the audit ledger.";

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
  openGraph: {
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    type: "article",
    images: [{ url: "/og-homepage.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    images: ["/og-homepage.png"],
  },
};

function TagRow({ tags }: { readonly tags: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full border border-edge bg-canvas px-2 py-0.5 text-[10px] uppercase tracking-section text-muted"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export default function BlogIndexPage() {
  const [featured, ...rest] = POSTS;

  return (
    <main className="bg-canvas">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <header className="mb-10 flex flex-col gap-3">
          <Link
            href="/"
            className="self-start rounded-sm text-eyebrow uppercase text-muted hover:text-ink focus-ring"
          >
            ← back to home
          </Link>
          <div className="flex items-end justify-between gap-4">
            <h1 className="text-h1 text-ink md:text-h1-lg">Notes from the kernel.</h1>
            <Link
              href="/blog/rss.xml"
              className="mb-1 inline-flex shrink-0 items-center gap-1.5 rounded-sm text-body-sm text-muted hover:text-ink focus-ring"
            >
              <Rss size={14} aria-hidden="true" /> RSS
            </Link>
          </div>
          <p className="max-w-measure text-lead text-muted">
            Kernel design, decision governance, and the practical lessons of
            shipping open-source policy — deep-dives on how DEFER resumes safely
            and how token budgets stay replay-verifiable, plus operational
            playbooks for keeping an AI agent from draining production.
          </p>
        </header>

        {/* Featured post — the latest, weighted larger. */}
        {featured ? (
          <Link
            href={`/blog/${featured.slug}`}
            className="group mb-6 block rounded-xl bg-surface p-6 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-sm focus-ring"
          >
            <span className="text-eyebrow uppercase text-brand-ink">Latest</span>
            <h2 className="mt-2 text-h3 text-ink">{featured.title}</h2>
            <p className="mt-2 max-w-measure text-body text-muted">
              {featured.summary}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <TagRow tags={featured.tags} />
              <span className="text-meta text-muted">
                {featured.date} · {featured.author}
              </span>
            </div>
          </Link>
        ) : null}

        <RevealGrid className="flex flex-col gap-6">
          {rest.map((p) => (
            <RevealGridItem key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="group block rounded-xl bg-surface p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-sm focus-ring"
              >
                <span className="text-meta uppercase tracking-section text-muted">
                  {p.date} · {p.author}
                </span>
                <h2 className="mt-1 text-h4 text-ink">{p.title}</h2>
                <p className="mt-2 text-body-sm text-muted">{p.summary}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <TagRow tags={p.tags} />
                  <span className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-ink">
                    Read post
                    <ArrowRight
                      size={14}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
              </Link>
            </RevealGridItem>
          ))}
        </RevealGrid>
      </section>
    </main>
  );
}
