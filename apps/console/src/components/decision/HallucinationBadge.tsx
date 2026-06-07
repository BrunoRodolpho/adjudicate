"use client";

import type { AuditRecord } from "@adjudicate/core";
import { cn } from "@/lib/cn";

/**
 * Hallucination-score badge (ADR-124). Renders the groundedness score + bucket
 * from `AuditRecord.metadata` (v5+). No new endpoint — the score rides on the
 * audit record. Absent metadata → renders nothing.
 */
const BUCKET_STYLE: Record<string, string> = {
  grounded: "text-emerald-300 border-emerald-500/40",
  uncertain: "text-amber-300 border-amber-500/40",
  hallucinated: "text-red-300 border-red-500/40",
};

export function HallucinationBadge({ record }: { record: AuditRecord }) {
  const meta = (record as { metadata?: Record<string, unknown> }).metadata;
  const score = meta?.hallucination_score;
  if (typeof score !== "number") return null;
  const bucket = typeof meta?.hallucination_bucket === "string" ? meta.hallucination_bucket : "uncertain";

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="hallucination-badge">
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">Hallucination · ADR-124</span>
      </header>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px]">
        <span
          className={cn(
            "inline-block rounded-sm border px-1.5 py-0.5 uppercase tracking-section",
            BUCKET_STYLE[bucket] ?? "text-muted border-edge",
          )}
        >
          {bucket}
        </span>
        <span className="tabular-nums text-ink">score {score.toFixed(2)}</span>
      </div>
    </section>
  );
}
