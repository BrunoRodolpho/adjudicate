import type { AuditRecord } from "@adjudicate/core";
import { formatDurationMs, formatRelative } from "@/lib/format";
import { DecisionBadge } from "./DecisionBadge";
import { IntentHashChip } from "./IntentHashChip";

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
      </div>
    </header>
  );
}
