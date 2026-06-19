"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * Reads the kill-switch STATUS (read-only) via `emergency.state`. The Adjudicant
 * OBSERVER shows the switch state but can never toggle it — `emergency.update` is
 * not even a member of the read-only tRPC client's type (a call would be a
 * compile error). 115 renders the kill-switch TIMELINE via `emergency.history`
 * as a `.query`; this hook surfaces the current state today.
 */
export function useKillSwitchStatus() {
  return useQuery({
    queryKey: ["adjudicant", "emergency", "state"],
    queryFn: () => trpc.emergency.state.query(),
    retry: false,
  });
}
