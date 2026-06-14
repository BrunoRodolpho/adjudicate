"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Lists incident rows (the IncidentState joined with the IncidentProjection's
 * remediation status) from `adjutant.incidents`. Telemetry read — never a kernel
 * input.
 */
export function useIncidents(filter: { status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ["adjutant", "incidents", filter],
    queryFn: () =>
      trpc.adjutant.incidents.query({
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.limit ? { limit: filter.limit } : {}),
      }),
    retry: false,
  });
}
