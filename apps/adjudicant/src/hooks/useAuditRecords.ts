"use client";

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc-client";

/**
 * The six closed kernel Decision kinds (invariant #2). Used to type the
 * Explorer's decision filter — there is no 7th kind, and the SDK wire schema
 * rejects anything outside this set, so a bad filter never reaches the store.
 */
export type DecisionKindFilter =
  | "EXECUTE"
  | "REFUSE"
  | "DEFER"
  | "ESCALATE"
  | "REQUEST_CONFIRMATION"
  | "REWRITE";

export interface AuditRecordsFilter {
  limit?: number;
  decisionKind?: DecisionKindFilter;
  intentKind?: string;
}

/**
 * Lists audit records (read-only) via `audit.query`. The OBSERVER reads the
 * kernel-emitted decision trail verbatim — this is a pure READ; the read-only
 * client has no procedure that could mutate a record. 112 builds the full Audit
 * Explorer on this surface.
 *
 * The result carries the store's `verifications` (092 verify-on-read, index-
 * aligned with `records`) and `chainIntegrity` (093 inter-record hash-chain
 * continuity) when the underlying store populates them, so the Explorer can
 * render per-row tamper badges and a chain-verify status WITHOUT this app ever
 * touching a mutation or re-running the kernel.
 */
export function useAuditRecords(filter: AuditRecordsFilter = {}) {
  return useQuery({
    queryKey: ["adjudicant", "audit", "query", filter],
    queryFn: () =>
      trpc.audit.query.query({
        ...(filter.limit ? { limit: filter.limit } : {}),
        ...(filter.decisionKind ? { decisionKind: filter.decisionKind } : {}),
        ...(filter.intentKind ? { intentKind: filter.intentKind } : {}),
      }),
    retry: false,
  });
}
