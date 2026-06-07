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
