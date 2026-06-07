"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * AI-BOM Explorer hooks (ADR-130). `useAiBomList` drives the left-rail pack
 * list (cheap summaries from `pack.aiBomList`); `useAiBomById` lazy-loads the
 * full BOM for the selected pack (`pack.aiBomById`). Both `retry: false` so a
 * PRECONDITION_FAILED (no BOMs wired) or NOT_FOUND (stale selection) surfaces
 * immediately as React Query's error state rather than retrying.
 */

/** Fetches the list of AI-BOM summaries from `pack.aiBomList`. */
export function useAiBomList() {
  return useQuery({
    queryKey: ["pack", "aiBomList"],
    queryFn: () => trpc.pack.aiBomList.query(),
    retry: false,
  });
}

/**
 * Fetches the full AI-BOM for one pack from `pack.aiBomById`. Disabled until a
 * `packId` is selected. `packVersion` omitted → the deterministic latest.
 */
export function useAiBomById(packId: string | null, packVersion?: string) {
  return useQuery({
    queryKey: ["pack", "aiBomById", packId, packVersion ?? null],
    queryFn: () =>
      trpc.pack.aiBomById.query({
        packId: packId as string,
        ...(packVersion ? { packVersion } : {}),
      }),
    enabled: packId !== null,
    retry: false,
  });
}
