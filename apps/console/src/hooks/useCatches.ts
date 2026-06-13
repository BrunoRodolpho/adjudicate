"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Fetches "caught a bad call" counts from `governance.catches` (item 7) — the
 * out-of-plan tool calls the adapter loop blocked. PRECONDITION_FAILED (no store
 * wired) surfaces as React Query's error state.
 *
 * TELEMETRY read, outside the determinism boundary — never feeds a kernel
 * decision.
 */
export function useCatches() {
  return useQuery({
    queryKey: ["governance", "catches"],
    queryFn: () => trpc.governance.catches.query(),
    retry: false,
  });
}
