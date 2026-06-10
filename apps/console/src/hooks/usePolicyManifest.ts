"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches the full policy manifest (rule-provenance tree data source) from
 * `governance.policyManifest`. Throws PRECONDITION_FAILED via tRPC when no
 * manifest is wired into the route-handler context — surface that as a
 * "not configured" empty state, not an error.
 */
export function usePolicyManifest() {
  return useQuery({
    queryKey: ["governance", "policyManifest"],
    queryFn: () => trpc.governance.policyManifest.query(),
    retry: false,
  });
}
