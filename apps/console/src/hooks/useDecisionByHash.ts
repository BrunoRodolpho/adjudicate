"use client";

import { useQuery } from "@tanstack/react-query";
import { gateway } from "@/lib/gateway/client";

/**
 * TanStack Query wrapper around `gateway.getDecision`.
 *
 * Disabled when no hash is provided (lets the calling page render a "no
 * hash" state instead of issuing a query for `null`). 60s `staleTime`
 * because a single AuditRecord is immutable once written.
 */
export function useDecisionByHash(intentHash: string | undefined) {
  return useQuery({
    queryKey: ["decision", intentHash],
    queryFn: () => gateway.getDecision(intentHash as string),
    enabled: typeof intentHash === "string" && intentHash.length > 0,
    staleTime: 60_000,
  });
}
