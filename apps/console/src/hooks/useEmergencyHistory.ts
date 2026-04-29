"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

export function useEmergencyHistory(limit = 20) {
  return useQuery({
    queryKey: ["emergency", "history", limit],
    queryFn: () => trpc.emergency.history.query({ limit }),
    staleTime: 30_000,
  });
}
