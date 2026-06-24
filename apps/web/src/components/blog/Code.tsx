import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/CopyButton";
import { highlightToHtml } from "@/lib/highlight";

/**
 * Highlighted code block for the editorial (blog) surface. Async server
 * component: shiki highlights at build time (see {@link highlightToHtml}), so
 * no syntax-highlighting code reaches the client bundle. Shares the same dark
 * chrome as {@link CodeBlock} (which stays plain + sync for install chips and
 * client components that can't await) — a filename bar or a floating copy
 * button, a zinc-900 surface, AA-safe.
 */
export async function Code({
  code,
  lang = "ts",
  filename,
  copyable = true,
  className,
}: {
  code: string;
  lang?: string;
  filename?: string;
  copyable?: boolean;
  className?: string;
}) {
  const html = await highlightToHtml(code, lang);
  const showChrome = Boolean(filename);
  const showFloatingCopy = !showChrome && copyable;

  return (
    <div
      className={cn(
        "relative my-stack min-w-0 max-w-full overflow-hidden rounded-lg border border-console-edge bg-zinc-900",
        className,
      )}
    >
      {showChrome ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
          <span className="truncate font-mono text-[11px] text-zinc-400">
            {filename}
            <span className="ml-2 uppercase tracking-section text-zinc-600">
              {lang}
            </span>
          </span>
          <CopyButton value={code} className="-mr-1 shrink-0" />
        </div>
      ) : null}
      {showFloatingCopy ? (
        <CopyButton
          value={code}
          className="absolute right-2 top-2 z-10 bg-zinc-900/80 backdrop-blur"
        />
      ) : null}
      <div
        // shiki emits `<pre class="shiki"><code>…`; strip its padding/margin and
        // let this wrapper own the box so the surface matches the plain chrome.
        className={cn(
          "overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed [&_code]:font-mono [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0",
          showFloatingCopy && "pr-12",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
