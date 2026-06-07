"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/** Fetches the AI-BOM (ADR-127) from `pack.aiBom`. PRECONDITION_FAILED → empty state. */
export function useAiBom() {
  return useQuery({
    queryKey: ["pack", "aiBom"],
    queryFn: () => trpc.pack.aiBom.query(),
    retry: false,
  });
}
