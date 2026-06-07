"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches the Tier-3 policy-coherence report (AJD-301, ADR-125) from
 * `governance.policyCoherence`. PRECONDITION_FAILED → "not configured".
 */
export function usePolicyCoherence() {
  return useQuery({
    queryKey: ["governance", "policyCoherence"],
    queryFn: () => trpc.governance.policyCoherence.query(),
    retry: false,
  });
}
