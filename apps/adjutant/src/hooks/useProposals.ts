"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Lists remediation proposals (the RemediationProposalStore read-model) from
 * `adjutant.proposals`. The internal envelope is never shipped over the wire.
 * Telemetry read — never a kernel input.
 */
export function useProposals(
  filter: { incidentId?: string; status?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: ["adjutant", "proposals", filter],
    queryFn: () =>
      trpc.adjutant.proposals.query({
        ...(filter.incidentId ? { incidentId: filter.incidentId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.limit ? { limit: filter.limit } : {}),
      }),
    retry: false,
  });
}
