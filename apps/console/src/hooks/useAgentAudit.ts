"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditRecord } from "@adjudicate/core";
import { gateway } from "@/lib/gateway/client";

/**
 * Managed-agent observation feed (WS-C). Reads the SAME audit ledger the rest
 * of the console reads, then keeps ONLY rows whose actor session rides the
 * unhashed managed-agent namespace (`agent:<id>@<ver>:…`). Read-only by
 * construction — no resolve/trigger here (those live behind the ibatexas staff
 * API; this console stays observation-only with hard limits).
 *
 * A server-side `session_id LIKE 'agent:%'` filter would be more efficient but
 * would touch the shared admin-sdk/audit-postgres query contract; for an
 * observation view over a sparse namespace, fetching a recent window and
 * filtering client-side keeps the blast radius to this app. `live` polls every
 * 5s (TanStack refetchInterval) — the SQL "live tail" with no new infra.
 */
export const AGENT_SESSION_PREFIX = "agent:";

function isAgentRecord(r: AuditRecord): boolean {
  const sid = r.envelope.actor.sessionId;
  return typeof sid === "string" && sid.startsWith(AGENT_SESSION_PREFIX);
}

export function useAgentAudit({
  limit = 500,
  live = true,
}: { limit?: number; live?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["agent-audit", limit],
    queryFn: () => gateway.queryAudit({ limit }),
    refetchInterval: live ? 5_000 : false,
  });

  const records: readonly AuditRecord[] = (query.data?.records ?? []).filter(isAgentRecord);
  const pending = records.filter((r) => r.decision.kind === "REQUEST_CONFIRMATION");

  return {
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    records,
    pending,
    /** Distinct agent session namespaces seen in the window. */
    agents: [...new Set(records.map((r) => r.envelope.actor.sessionId))],
  };
}
