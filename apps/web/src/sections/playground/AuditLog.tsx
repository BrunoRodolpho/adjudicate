"use client";

import { DecisionBadge } from "@/components/motion/DecisionBadge";
import type { Decision } from "@adjudicate/core";

export interface AuditLogEntry {
  readonly intentKind: string;
  readonly decision: Decision;
  readonly at: string;
  readonly packName: string;
}

/**
 * Shared right-rail audit-record log. Each playground tab pushes a record
 * after every successful adjudication; this component renders the rolling
 * list, newest-first. Storage is in-memory at the section level (per
 * visitor) — never persisted across page loads.
 */
export function AuditLog({
  entries,
  onClear,
}: {
  entries: ReadonlyArray<AuditLogEntry>;
  onClear: () => void;
}) {
  return (
    <aside className="flex flex-col rounded-lg border border-edge bg-canvas/40">
      <header className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Audit log · {entries.length}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="text-[10px] uppercase tracking-section text-muted hover:text-ink disabled:opacity-40"
        >
          clear
        </button>
      </header>
      <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto p-2 text-[12px]">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center italic text-faint">
            Adjudicate something to populate the log.
          </p>
        ) : (
          entries.map((e, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-md border border-edge bg-surface px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <DecisionBadge kind={e.decision.kind} size="sm" animate={false} />
                <span className="text-[10px] text-faint">
                  {e.at.slice(11, 19)}
                </span>
              </div>
              <code className="truncate text-[10px] text-ink">
                {e.intentKind}
              </code>
              <span className="text-[10px] text-muted">{e.packName}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
