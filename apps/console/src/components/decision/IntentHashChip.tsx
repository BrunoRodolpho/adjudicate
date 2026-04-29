"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { truncateHash } from "@/lib/format";

export function IntentHashChip({
  hash,
  full = false,
  className,
}: {
  hash: string;
  full?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable; degrade silently.
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-sm border border-edge bg-canvas px-1.5 py-0.5 text-[11px] text-muted hover:border-ink/30 hover:text-ink",
        className,
      )}
      title={copied ? "copied" : `${hash} — click to copy`}
    >
      <span className="font-mono">
        {full ? hash : truncateHash(hash, 8, 6)}
      </span>
      {copied ? (
        <Check size={11} className="text-emerald-400" />
      ) : (
        <Copy size={11} className="opacity-50 group-hover:opacity-100" />
      )}
    </button>
  );
}
