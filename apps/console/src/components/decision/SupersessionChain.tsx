import type { Supersession } from "@adjudicate/core";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

/**
 * SupersessionChain — renders the predecessor link of a v3 AuditRecord.
 *
 * `confirmation_resolved` records link back to the original
 * REQUEST_CONFIRMATION audit row; `defer_resumed` records to the DEFER row;
 * `rewrite_executed` to the rewritten source; `replay` to the replayed
 * source. The link target is `/decisions/[predecessorIntentHash]`.
 *
 * Note: for `confirmation_resolved` the predecessor's intentHash matches the
 * current record's intentHash (same envelope, re-adjudicated), so the link
 * goes to the same hash but to the *earlier* audit row by `predecessorAt`.
 * The audit-postgres reader's `getByIntentHash` returns newest-first; deeper
 * supersession-aware navigation lands in a follow-up.
 */
export function SupersessionChain({
  supersedes,
}: {
  supersedes: Supersession;
}) {
  const label = REASON_LABEL[supersedes.reason];
  return (
    <div className="border-b border-edge bg-amber-500/5 px-3 py-1.5">
      <Link
        href={`/decisions/${supersedes.predecessorIntentHash}`}
        className="group flex items-center gap-2 text-[11px] text-amber-200 hover:text-amber-100"
      >
        <span className="text-[10px] uppercase tracking-section text-amber-300/70 group-hover:text-amber-200">
          {label}
        </span>
        <code className="text-ink/80 group-hover:text-ink">
          {supersedes.predecessorIntentHash.slice(0, 12)}…
        </code>
        <span className="text-faint group-hover:text-muted">
          @ {formatAt(supersedes.predecessorAt)}
        </span>
        <ArrowUpRight
          size={11}
          className="opacity-50 transition-opacity group-hover:opacity-100"
        />
      </Link>
    </div>
  );
}

const REASON_LABEL: Record<Supersession["reason"], string> = {
  confirmation_resolved: "Confirmed from request",
  defer_resumed: "Resumed from defer",
  rewrite_executed: "Rewritten from",
  replay: "Replayed from",
  lgpd_scrub: "LGPD scrub from",
};

function formatAt(iso: string): string {
  // "2026-05-13T12:00:01.000Z" → "2026-05-13 12:00:01Z"
  return iso.replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}
