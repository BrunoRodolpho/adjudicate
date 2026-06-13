"use client";

import { useState } from "react";
import { AuditTable } from "@/components/table/AuditTable";
import { useAgentAudit } from "@/hooks/useAgentAudit";

/**
 * Agents — managed-agent observation (WS-C / DR-3: console gets /agents; the
 * QA viewer stays QA-only).
 *
 * OBSERVATION ONLY, HARD LIMITS: this view reads the audit ledger (SQL) for the
 * unhashed `agent:` session namespace and shows the agents' adjudicated
 * decisions — including pending Stage-1 REQUEST_CONFIRMATION rows (the NATS
 * `support.handoff_requested` page is the wake signal for those). There are NO
 * mutating controls here: triggering an agent and resolving an approval are
 * staff actions on the ibatexas API, never from this console.
 *
 * Scope notes: the agent's NATS wake/handoff subjects
 * (`payment.status_changed`, `support.handoff_requested`) and its structured
 * logs (`component:"agent-runs"`) live in the ibatexas process; a live NATS
 * tail + log view are net-new infra (a subscribe-only client + an SSE route)
 * and are the next increment. The SQL decision feed below is the primary
 * surface and needs the console's DATABASE_URL pointed at the audit ledger.
 */
export default function AgentsPage() {
  const [live, setLive] = useState(true);
  const { records, pending, agents, isLoading, isFetching, error } = useAgentAudit({ live });

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Agents — managed-agent observation (read-only)
        </h1>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-section text-faint">
          <input
            type="checkbox"
            checked={live}
            onChange={() => setLive((v) => !v)}
          />
          live {isFetching ? "·" : ""}
        </label>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="agent decisions" value={records.length} />
        <Stat label="pending approval" value={pending.length} tone={pending.length > 0 ? "warn" : undefined} />
        <Stat label="agents seen" value={agents.length} />
      </section>

      <p className="text-[10px] text-faint">
        Rows where <code>session_id LIKE &apos;agent:%&apos;</code> in the audit ledger.
        Observation only — no trigger/resolve controls. NATS tail + logs are the
        next increment (see file header).
      </p>

      <section className="flex flex-col gap-2">
        <header className="text-[10px] uppercase tracking-section text-faint">
          Decisions
        </header>
        {error !== null ? (
          <div className="rounded-sm border border-edge bg-panel/40 p-3 text-[11px] text-red-300">
            Failed to load agent audit: {error.message}
          </div>
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center text-[11px] text-muted">
            Loading agent decisions…
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-sm border border-edge bg-panel/40 p-6 text-center text-[11px] text-muted">
            No <code>agent:</code> rows in the recent window. The plane is flag-gated
            (<code>IBX_AGENTS_ENABLED</code>, default off / Stage-0 shadow) — trigger one
            with <code>ibx agent trigger</code> against the live stack, and confirm this
            console&apos;s <code>DATABASE_URL</code> points at the audit ledger.
          </div>
        ) : (
          <AuditTable records={records} />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-sm border border-edge bg-panel/40 p-3">
      <div className="text-[10px] uppercase tracking-section text-faint">{label}</div>
      <div
        className={
          tone === "warn"
            ? "text-2xl tabular-nums text-amber-300"
            : "text-2xl tabular-nums text-ink"
        }
      >
        {value}
      </div>
    </div>
  );
}
