import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { findPost, POSTS } from "@/content/blog";
import { GITHUB_ISSUES } from "@/content/github";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) {
    return { title: "Post not found · adjudicate" };
  }
  const title = `${post.title} · adjudicate`;
  return {
    title,
    description: post.summary,
    openGraph: {
      title,
      description: post.summary,
      type: "article",
      images: [{ url: "/og-homepage.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: post.summary,
      images: ["/og-homepage.png"],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) return notFound();
  const Body = post.body;
  // Newest-first, excluding the current post — for the "read next" footer.
  const otherPosts = POSTS.filter((p) => p.slug !== post.slug);
  return (
    <main className="bg-canvas">
      <article className="mx-auto max-w-measure px-6 py-24">
        <header className="mb-8 flex flex-col gap-3">
          <Link
            href="/blog"
            className="self-start text-[11px] uppercase tracking-section text-muted hover:text-ink"
          >
            ← all posts
          </Link>
          <span className="text-xs uppercase tracking-section text-muted">
            {post.date} · {post.author}
          </span>
          <h1 className="text-h1 text-ink md:text-h1-lg">{post.title}</h1>
          {/* Front-matter intro: a one-line standfirst so a reader knows the
              shape of the post before diving into the technical body. */}
          <p className="mt-1 text-lead text-muted">{post.summary}</p>
        </header>
        <Body />

        {/* Footer CTA — forward-looking next steps + related posts. */}
        <footer className="mt-16 border-t border-edge pt-8">
          <h2 className="text-sm font-semibold text-ink">What&apos;s next?</h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href="/architecture"
              className="group inline-flex items-center gap-1 font-medium text-brand-ink hover:text-brand-ink"
            >
              How the kernel works
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/playground"
              className="group inline-flex items-center gap-1 font-medium text-brand-ink hover:text-brand-ink"
            >
              Try a live decision
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-ink hover:text-brand-ink"
            >
              Open an issue or join the discussion
              <ArrowUpRight size={14} />
            </a>
          </div>

          {otherPosts.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-[11px] uppercase tracking-section text-muted">
                Keep reading
              </h3>
              <ul className="mt-3 flex flex-col gap-3">
                {otherPosts.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="group block rounded-lg border border-edge bg-surface p-4 transition-all hover:border-ink/40 hover:shadow-sm"
                    >
                      <span className="text-[11px] uppercase tracking-section text-muted">
                        {p.date}
                      </span>
                      <p className="mt-0.5 text-sm font-medium text-ink">
                        {p.title}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </footer>
      </article>
    </main>
  );
}
