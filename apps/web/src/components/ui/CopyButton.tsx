"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Tiny copy-to-clipboard button. Isolated as its own client component so
 * server components (CodeBlock) can embed it without becoming client
 * components themselves.
 */
export function CopyButton({
  value,
  className,
}: {
  readonly value: string;
  readonly className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard unavailable — fail silently */
      });
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy code"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200",
        className,
      )}
    >
      {copied ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
