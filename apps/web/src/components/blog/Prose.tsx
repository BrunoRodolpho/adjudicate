import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Editorial prose wrapper for blog bodies. Styles bare semantic elements
 * (`<p>`, `<h2>`, `<h3>`, `<ul>`, `<a>`, inline `<code>`, `<em>`, `<strong>`)
 * via token-driven descendant variants, so a post is written as plain HTML and
 * inherits one consistent reading rhythm — replacing the per-post ad-hoc inline
 * classes (and the dead `prose-body` class) that drifted across the four posts.
 *
 * Block code (`<Code>` / shiki's `<pre><code>`) is deliberately excluded from
 * the inline-code chip styling via `:not(pre) > code`.
 */
export function Prose({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-measure flex-col gap-5 text-body text-muted-strong",
        // headings
        "[&_h2]:mt-block [&_h2]:text-h3 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink",
        "[&_h3]:mt-stack [&_h3]:text-h4 [&_h3]:font-semibold [&_h3]:text-ink",
        // body paragraphs
        "[&_p]:text-body [&_p]:text-muted-strong",
        // links
        "[&_a]:font-medium [&_a]:text-brand-ink [&_a]:underline [&_a]:decoration-brand/30 [&_a]:underline-offset-2 [&_a:hover]:decoration-brand-ink",
        // inline code (not the highlighted block)
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface-2 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em] [&_:not(pre)>code]:text-ink",
        // emphasis
        "[&_strong]:font-semibold [&_strong]:text-ink [&_em]:italic",
        // lists
        "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-5 [&_li]:pl-1 [&_li]:marker:text-faint",
        className,
      )}
    >
      {children}
    </div>
  );
}
