import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findPost, POSTS } from "@/content/blog";

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
  return (
    <main className="bg-canvas">
      <article className="mx-auto max-w-3xl px-6 py-24">
        <header className="mb-8 flex flex-col gap-3">
          <Link
            href="/blog"
            className="self-start text-[11px] uppercase tracking-section text-muted hover:text-ink"
          >
            ← all posts
          </Link>
          <span className="text-xs uppercase tracking-section text-faint">
            {post.date} · {post.author}
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
            {post.title}
          </h1>
        </header>
        <div className="text-base leading-relaxed text-ink">
          <Body />
        </div>
      </article>
    </main>
  );
}
