import { GitMerge } from "lucide-react";
import Link from "next/link";
import type { AuditRecord } from "@adjudicate/core";
import { DecisionBadge } from "./DecisionBadge";
import { IntentHashChip } from "./IntentHashChip";
import { formatDurationMs, formatRelative } from "@/lib/format";

export function DecisionTraceHeader({ record }: { record: AuditRecord }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-canvas px-3 py-2">
      <div className="flex items-center gap-3 text-[12px]">
        <DecisionBadge kind={record.decision.kind} showSummary />
        <span className="text-ink">{record.envelope.kind}</span>
        <span className="text-faint">·</span>
        <span className="text-[11px] text-muted">
          taint={record.envelope.taint}
        </span>
        <span className="text-faint">·</span>
        <span className="text-[11px] text-muted">
          principal={record.envelope.actor.principal}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted">
        <time
          dateTime={record.at}
          title={record.at}
          className="tabular-nums"
        >
          {formatRelative(record.at)}
        </time>
        <span className="text-faint">·</span>
        <span className="tabular-nums">
          {formatDurationMs(record.durationMs)}
        </span>
        <span className="text-faint">·</span>
        <IntentHashChip hash={record.intentHash} />
        {record.supersedes ? (
          <>
            <span className="text-faint">·</span>
            <Link
              href={`/decisions/${record.intentHash}/lineage`}
              className="flex items-center gap-1 text-amber-200 hover:text-amber-100"
              title="Walk the supersession chain backward"
            >
              <GitMerge size={11} /> View Lineage
            </Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
