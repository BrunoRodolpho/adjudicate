"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches the behavioral-drift snapshot (ADR-119) from
 * `governance.behavioralDrift`. PRECONDITION_FAILED (no detector wired)
 * surfaces as a "not configured" empty state.
 */
export function useBehavioralDrift() {
  return useQuery({
    queryKey: ["governance", "behavioralDrift"],
    queryFn: () => trpc.governance.behavioralDrift.query(),
    retry: false,
  });
}
