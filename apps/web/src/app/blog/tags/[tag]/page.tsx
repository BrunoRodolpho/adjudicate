import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  BLOG_TAGS,
  postsByTagSlug,
  tagFromSlug,
  tagToSlug,
} from "@/content/blog";

interface PageProps {
  params: Promise<{ tag: string }>;
}

export function generateStaticParams() {
  return BLOG_TAGS.map((t) => ({ tag: tagToSlug(t) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tag: tagSlug } = await params;
  const tag = tagFromSlug(tagSlug);
  if (!tag) return { title: "Tag not found · adjudicate" };
  const title = `Posts tagged “${tag}” · adjudicate`;
  return { title, description: `Engineering posts tagged ${tag}.` };
}

export default async function BlogTagPage({ params }: PageProps) {
  const { tag: tagSlug } = await params;
  const tag = tagFromSlug(tagSlug);
  if (!tag) return notFound();
  const posts = postsByTagSlug(tagSlug);

  return (
    <main className="bg-canvas">
      <div className="mx-auto max-w-measure px-6 py-24">
        <Link
          href="/blog"
          className="focus-ring inline-flex items-center gap-1.5 self-start rounded-sm text-eyebrow uppercase text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden="true" /> All posts
        </Link>
        <p className="mt-6 text-eyebrow uppercase tracking-section text-brand-ink">
          Tagged
        </p>
        <h1 className="mt-2 text-h1 text-ink md:text-h1-lg">{tag}</h1>
        <p className="mt-3 text-lead text-muted">
          {posts.length} {posts.length === 1 ? "post" : "posts"} tagged “{tag}”.
        </p>

        <ul className="mt-10 flex flex-col gap-3">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="focus-ring group block rounded-xl bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <span className="text-meta uppercase tracking-section text-muted">
                  {p.date}
                </span>
                <p className="mt-1 text-h4 text-ink">{p.title}</p>
                <p className="mt-1.5 text-body-sm leading-relaxed text-muted">
                  {p.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
