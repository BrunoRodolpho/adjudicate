"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditRecord, AuditRecordVerification } from "@adjudicate/core";
import { trpc } from "@/lib/trpc-client";
import { correlateCase, type CorrelatedCase } from "@/lib/case-correlation";

/**
 * 113 — fetches a correlated CASE for the Investigations surface.
 *
 * Given a seed `intentHash`, it composes PURE-READ procedures only:
 *   - `audit.query` returns a window of records (with index-aligned 092
 *     verify-on-read verdicts when the store supplies them), and
 *   - `correlateCase` (a pure helper) groups the seed's session + supersession
 *     lineage into the case timeline.
 *
 * It introduces NO mutation: the read-only client is typed against
 * `ReadOnlyAdminRouter`, so the only procedures even reachable are `.query`. The
 * surface produces FACTS (a correlated view + integrity verdicts), never a
 * decision — consistent with §C monotonicity and constitutional invariant #1.
 *
 * `tenantScope`, when supplied, is threaded to the host-enforced tenant
 * isolation seam so a multi-tenant host never correlates across tenants.
 *
 * Correlation is window-scoped to `limit` records (capped at the SDK's 500): it
 * is an investigation SIGNAL over the fetched page, not a global proof.
 */
export interface UseCaseOptions {
  /** Window size for the correlation fetch. Defaults to 200; SDK caps at 500. */
  limit?: number;
  /** Host-enforced tenant scope, threaded to the read seam when present. */
  tenantScope?: string;
}

export function useCase(intentHash: string, opts: UseCaseOptions = {}) {
  const trimmed = intentHash.trim();
  const limit = opts.limit ?? 200;
  const tenantScope = opts.tenantScope;

  return useQuery<CorrelatedCase>({
    queryKey: ["adjudicant", "case", trimmed, limit, tenantScope],
    queryFn: async () => {
      const result = await trpc.audit.query.query({
        limit,
        ...(tenantScope ? { tenantScope } : {}),
      });
      // `audit.query` returns readonly arrays of the wire-schema record/verdict
      // types; correlateCase consumes the structural core shapes. The wire
      // schema is a superset, so the cast is sound (no field is added or
      // dropped). We never mutate the records — only group references.
      return correlateCase(
        {
          records: result.records as unknown as readonly AuditRecord[],
          verifications: result.verifications as unknown as
            | readonly AuditRecordVerification[]
            | undefined,
        },
        trimmed,
      );
    },
    enabled: trimmed.length > 0,
    retry: false,
  });
}
