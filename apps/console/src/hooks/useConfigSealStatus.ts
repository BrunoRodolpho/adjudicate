"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches the config-integrity seal status (ADR-121) from
 * `governance.configSealStatus`. PRECONDITION_FAILED surfaces as a
 * "not configured" empty state.
 */
export function useConfigSealStatus() {
  return useQuery({
    queryKey: ["governance", "configSealStatus"],
    queryFn: () => trpc.governance.configSealStatus.query(),
    retry: false,
  });
}
