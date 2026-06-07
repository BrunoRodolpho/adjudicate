"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches the pre-computed adversarial red-team report (ADR-118) from
 * `governance.redTeam`. PRECONDITION_FAILED (no report wired) surfaces as a
 * "not configured" empty state rather than a retryable error.
 */
export function useRedTeam() {
  return useQuery({
    queryKey: ["governance", "redTeam"],
    queryFn: () => trpc.governance.redTeam.query(),
    retry: false,
  });
}

/**
 * Fetches the bounded red-team run-history (ADR-133) from
 * `governance.redTeamHistory` — per-pack run records + a defended/escaped/error
 * trend over runs. `retry: false` so a PRECONDITION_FAILED (no history wired)
 * surfaces immediately as the error state rather than retrying.
 */
export function useRedTeamHistory(packId?: string) {
  return useQuery({
    queryKey: ["governance", "redTeamHistory", packId ?? null],
    queryFn: () =>
      trpc.governance.redTeamHistory.query(packId ? { packId } : {}),
    retry: false,
  });
}
