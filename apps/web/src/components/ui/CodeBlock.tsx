import { cn } from "@/lib/cn";

/**
 * Minimal code block. Keeps shiki out of the bundle — shipping syntax
 * highlighting is a follow-up; for v1 we render plain text in a monospace
 * dark surface so code reads cleanly against the light marketing canvas.
 */
export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-lg border border-edge bg-zinc-900 px-4 py-3 text-[13px] leading-relaxed text-zinc-100 font-mono",
        className,
      )}
    >
      {language ? (
        <div className="mb-2 text-[10px] uppercase tracking-section text-zinc-500">
          {language}
        </div>
      ) : null}
      <code>{code}</code>
    </pre>
  );
}
