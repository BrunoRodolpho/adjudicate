import { FileSearch } from "lucide-react";
import type { AuditRecord } from "@adjudicate/core";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CONSOLE_REPLICA_RECORDS_BY_HASH } from "@/lib/console-replica-records";
import { cn } from "@/lib/cn";

/**
 * DecisionTraceReplica — the DEEPEST "what a receipt contains" replica surface.
 *
 * Server component. Resolves one ILLUSTRATIVE sample `AuditRecord` from the
 * committed `CONSOLE_REPLICA_RECORDS_BY_HASH` fixture by its `intentHash`, then
 * wraps the shared {@link ReceiptCard} (variant `"full"`, trace on) inside the
 * {@link ConsoleChrome} honesty boundary. The chrome ALWAYS carries the
 * standing "Illustrative replica of the operator console · sample data" label —
 * this is a reviewed security control, not styling (the roadmap's "no fake live
 * data" invariant). apps/web reads no DATABASE_URL/REDIS_URL/admin tokens and
 * fetches no /api/admin or SSE endpoint; the only data ever rendered here is the
 * prop-driven, clearly-labeled sample fixture.
 *
 * This mirrors apps/console's `DecisionTrace` flagship surface, but renders only
 * the side panels whose data is actually present on the fixture record — e.g.
 * the v5 `hallucination_score` badge is shown ONLY when that metadata exists.
 * Unknown / unmatched hashes render a ConsoleChrome `EmptyState` rather than
 * throwing, so every prerendered or hand-typed hash degrades gracefully.
 */
export function DecisionTraceReplica({
  intentHash,
}: {
  readonly intentHash: string;
}) {
  const record = CONSOLE_REPLICA_RECORDS_BY_HASH.get(intentHash);

  if (!record) {
    return (
      <ConsoleChrome caption="decision · localhost:5180">
        <EmptyState
          icon={FileSearch}
          title="No such receipt"
          hint="This intentHash is not in the illustrative sample feed. Pick a decision from the audit-explorer replica to inspect its full anatomy."
        />
      </ConsoleChrome>
    );
  }

  return (
    <ConsoleChrome caption="decision · localhost:5180">
      <div className="flex flex-col gap-4">
        <HallucinationBadge record={record} />
        <ReceiptCard record={record} variant="full" showTrace />
      </div>
    </ConsoleChrome>
  );
}

/**
 * Lightweight, server-only groundedness badge (ADR-124). The score rides on the
 * audit record's v5 `metadata` — no new endpoint. Absent / non-numeric score →
 * renders nothing (the side panel is simply omitted). Mirrors the bucket palette
 * of apps/console's `HallucinationBadge`, but stays a pure server component.
 */
const BUCKET_STYLE: Record<string, string> = {
  grounded: "border-emerald-500/40 text-emerald-300",
  uncertain: "border-amber-500/40 text-amber-300",
  hallucinated: "border-red-500/40 text-red-300",
};

function HallucinationBadge({ record }: { readonly record: AuditRecord }) {
  const meta = record.metadata;
  const score = meta?.["hallucination_score"];
  if (typeof score !== "number") return null;

  const rawBucket = meta?.["hallucination_bucket"];
  const bucket = typeof rawBucket === "string" ? rawBucket : "uncertain";

  return (
    <div
      data-testid="hallucination-badge"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-console-edge bg-console-panel px-3 py-2"
    >
      <span className="text-[10px] uppercase tracking-section text-console-faint">
        Hallucination · ADR-124
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-section",
          BUCKET_STYLE[bucket] ?? "border-console-edge text-console-muted",
        )}
      >
        {bucket}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-console-ink">
        score {score.toFixed(2)}
      </span>
    </div>
  );
}
