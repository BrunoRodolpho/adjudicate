"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/** Fetches cross-session memory (ADR-126) for a session. PRECONDITION_FAILED → empty state. */
export function useSessionMemory(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["memory", "bySession", sessionId],
    queryFn: () => trpc.memory.bySession.query({ sessionId: sessionId! }),
    enabled: Boolean(sessionId),
    retry: false,
    staleTime: 30_000,
  });
}
