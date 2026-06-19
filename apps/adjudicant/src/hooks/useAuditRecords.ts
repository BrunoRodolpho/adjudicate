"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Lists audit records (read-only) via `audit.query`. The OBSERVER reads the
 * kernel-emitted decision trail verbatim — this is a pure READ; the read-only
 * client has no procedure that could mutate a record. 112 builds the full Audit
 * Explorer on this surface.
 */
export function useAuditRecords(filter: { limit?: number } = {}) {
  return useQuery({
    queryKey: ["adjudicant", "audit", "query", filter],
    queryFn: () =>
      trpc.audit.query.query({
        ...(filter.limit ? { limit: filter.limit } : {}),
      }),
    retry: false,
  });
}
