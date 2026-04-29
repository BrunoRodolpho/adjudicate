"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Polls the emergency state every 5 seconds.
 *
 * Polling is deliberate: kill-switch state can change from another
 * operator's session on a different replica. The console must surface
 * the new status quickly without waiting for a manual refresh. 5s is
 * the operational sweet spot — fast enough that misalignment is short,
 * slow enough that a hundred open dashboards don't hammer the route.
 */
export function useEmergencyState() {
  return useQuery({
    queryKey: ["emergency", "state"],
    queryFn: () => trpc.emergency.state.query(),
    refetchInterval: 5_000,
    staleTime: 0,
  });
}
