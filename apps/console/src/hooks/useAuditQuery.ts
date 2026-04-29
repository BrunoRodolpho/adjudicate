"use client";

import { useQuery } from "@tanstack/react-query";
import { gateway } from "@/lib/gateway/client";
import type { AuditQuery } from "@/types/adjudicate";

/**
 * TanStack Query wrapper around `gateway.queryAudit`.
 *
 * QueryKey includes the full filter object so cache entries are scoped per
 * unique view. On filter change, the previous result stays mounted while
 * the new one fetches — no flash of empty.
 */
export function useAuditQuery(filters: AuditQuery) {
  return useQuery({
    queryKey: ["audit", filters],
    queryFn: () => gateway.queryAudit(filters),
  });
}
