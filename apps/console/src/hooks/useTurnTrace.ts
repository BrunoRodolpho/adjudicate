"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * TanStack Query wrapper around `trace.byConversation` — the per-LLM-call
 * turn trace for one conversation (responder-trace-admin C3). Disabled when no
 * conversationId is provided. Traces are append-only/immutable once written, so
 * a 30s staleTime is safe.
 */
export function useTurnTraceByConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["turn-trace", "conversation", conversationId],
    queryFn: () =>
      trpc.trace.byConversation.query({ conversationId: conversationId as string }),
    enabled: typeof conversationId === "string" && conversationId.length > 0,
    staleTime: 30_000,
  });
}
