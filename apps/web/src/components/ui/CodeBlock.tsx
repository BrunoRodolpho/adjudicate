import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/CopyButton";

/**
 * Minimal code block. Keeps shiki out of the bundle — shipping syntax
 * highlighting is a follow-up; for v1 we render plain text in a monospace
 * dark surface so code reads cleanly against the light marketing canvas.
 *
 * Three rendering paths, all server-renderable (CopyButton is the only
 * client island):
 *   - `filename` set  → chrome bar with filename + copy button.
 *   - `copyable` set  → no chrome; a floating copy button sits in the
 *     top-right of the code surface (1-click copy without a filename).
 *   - neither set     → plain block; if `language` is given it is kept
 *     inline so existing callers render exactly as before.
 */
export function CodeBlock({
  code,
  language,
  filename,
  copyable = false,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  /**
   * Show a copy-to-clipboard affordance without a filename chrome bar.
   * Defaults to false for backward compatibility. Ignored when `filename`
   * is set (the chrome bar already carries a copy button).
   */
  copyable?: boolean;
  className?: string;
}) {
  const showChrome = Boolean(filename);
  const showFloatingCopy = !showChrome && copyable;

  return (
    <div
      className={cn(
        // min-w-0 + max-w-full so a long code line never forces the block wider
        // than its (possibly flex) parent — overflow-x-auto on <pre> scrolls it.
        "relative min-w-0 max-w-full overflow-hidden rounded-lg border border-edge bg-zinc-900",
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
      {showFloatingCopy ? (
        <CopyButton
          value={code}
          className="absolute right-2 top-2 z-10 bg-zinc-900/80 backdrop-blur"
        />
      ) : null}
      <pre
        className={cn(
          "overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-100",
          // reserve room so a single-line command never runs under the
          // floating copy button (fixes the truncated install-chip).
          showFloatingCopy && "pr-12",
        )}
      >
        {!showChrome && language ? (
          <div
            className={cn(
              "mb-2 text-[10px] uppercase tracking-section text-zinc-500",
              showFloatingCopy && "pr-16",
            )}
          >
            {language}
          </div>
        ) : null}
        <code>{code}</code>
      </pre>
    </div>
  );
}
