"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditRecord } from "@adjudicate/core";
import { gateway } from "@/lib/gateway/client";

/** Maximum predecessors walked per chain. Cycle-safe. */
export const MAX_LINEAGE_DEPTH = 20;

export interface LineageNode {
  readonly record: AuditRecord;
  /** Depth from the root (0 = the starting record). */
  readonly depth: number;
}

export interface LineageResult {
  readonly nodes: readonly LineageNode[];
  readonly truncated: boolean;
  /** True if we detected a cycle (predecessor pointing to an already-seen hash). */
  readonly cyclic: boolean;
}

/**
 * Walks `record.supersedes.predecessorIntentHash` backward.
 *
 * Bounded at {@link MAX_LINEAGE_DEPTH} predecessors and cycle-safe — a
 * fixed-size `seen` set short-circuits if a chain folds back on itself
 * (which shouldn't happen under correct kernel behavior but is cheap to
 * guard against).
 *
 * The walk runs in a single `useQuery` so React Suspense / loading state
 * are observable from the consuming component without bespoke wiring.
 */
export function useLineage(intentHash: string | undefined) {
  return useQuery<LineageResult>({
    queryKey: ["lineage", intentHash],
    enabled: typeof intentHash === "string" && intentHash.length > 0,
    staleTime: 60_000,
    queryFn: async () => walkLineage(intentHash as string),
  });
}

async function walkLineage(startHash: string): Promise<LineageResult> {
  const nodes: LineageNode[] = [];
  const seen = new Set<string>();
  let currentHash: string | undefined = startHash;
  let depth = 0;
  let truncated = false;
  let cyclic = false;

  while (currentHash !== undefined) {
    if (seen.has(currentHash)) {
      cyclic = true;
      break;
    }
    if (depth >= MAX_LINEAGE_DEPTH) {
      truncated = true;
      break;
    }
    seen.add(currentHash);
    const record: AuditRecord | null = await gateway.getDecision(currentHash);
    if (!record) break;
    nodes.push({ record, depth });
    currentHash = record.supersedes?.predecessorIntentHash;
    depth += 1;
  }

  return { nodes, truncated, cyclic };
}
