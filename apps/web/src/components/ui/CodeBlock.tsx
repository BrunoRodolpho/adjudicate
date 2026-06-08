import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/CopyButton";

/**
 * Minimal code block. Keeps shiki out of the bundle — shipping syntax
 * highlighting is a follow-up; for v1 we render plain text in a monospace
 * dark surface so code reads cleanly against the light marketing canvas.
 *
 * Optionally renders a chrome bar (filename + copy button). When no chrome
 * is shown and a `language` is given, the language label is kept inline so
 * existing callers render exactly as before.
 */
export function CodeBlock({
  code,
  language,
  filename,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}) {
  const showChrome = Boolean(filename);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-edge bg-zinc-900",
        className,
      )}
    >
      {showChrome ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
          <span className="truncate font-mono text-[11px] text-zinc-400">
            {filename}
            {language ? (
              <span className="ml-2 uppercase tracking-section text-zinc-600">
                {language}
              </span>
            ) : null}
          </span>
          <CopyButton value={code} className="-mr-1 shrink-0" />
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-100">
        {!showChrome && language ? (
          <div className="mb-2 text-[10px] uppercase tracking-section text-zinc-500">
            {language}
          </div>
        ) : null}
        <code>{code}</code>
      </pre>
    </div>
  );
}
