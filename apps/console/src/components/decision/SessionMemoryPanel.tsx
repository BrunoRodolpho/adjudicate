"use client";

import { useSessionMemory } from "@/hooks/useSessionMemory";

/**
 * Session Memory panel (ADR-126) — the cross-session memory enriching the
 * planner for this decision's session. Upstream-only: it never affects the
 * kernel decision, so it's shown for context, not as a decision input.
 */
export function SessionMemoryPanel({ sessionId }: { sessionId: string }) {
  const { data, isLoading, isError } = useSessionMemory(sessionId);

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="session-memory-panel">
      <header className="border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Session Memory · ADR-126
        </span>
      </header>
      <div className="px-3 py-2 text-[11px]">
        {isLoading ? (
          <p className="text-muted">Loading memory…</p>
        ) : isError || !data ? (
          <p className="italic text-faint">Memory lookup not configured.</p>
        ) : !data.present ? (
          <p className="italic text-faint">No memory for session {sessionId}.</p>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap text-ink">
            {JSON.stringify(data.memory, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
