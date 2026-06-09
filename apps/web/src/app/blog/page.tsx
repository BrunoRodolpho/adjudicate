import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { POSTS } from "@/content/blog";

const BLOG_TITLE = "adjudicate · blog";
const BLOG_DESCRIPTION =
  "Notes from the kernel — engineering and design writing on guardrails for AI agents, the six decision outcomes, and the audit ledger.";

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
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

export default function BlogIndexPage() {
  return (
    <main className="bg-canvas">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <header className="mb-10 flex flex-col gap-3">
          <Link
            href="/"
            className="self-start text-[11px] uppercase tracking-section text-muted hover:text-ink"
          >
            ← back to home
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">
            Notes from the kernel.
          </h1>
        </header>
        <ul className="flex flex-col gap-6">
          {POSTS.map((p) => (
            <li
              key={p.slug}
              className="rounded-xl border border-edge bg-surface p-5"
            >
              <span className="text-xs uppercase tracking-section text-faint">
                {p.date}
              </span>
              <h2 className="mt-1 text-xl font-semibold text-ink">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {p.summary}
              </p>
              <Link
                href={`/blog/${p.slug}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Read post <ArrowRight size={14} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
