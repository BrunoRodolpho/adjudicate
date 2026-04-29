"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { DecisionKind, Taint } from "@adjudicate/core";
import type { AuditQuery } from "@/types/adjudicate";

const VALID_DECISION_KINDS = new Set<DecisionKind>([
  "EXECUTE",
  "REFUSE",
  "DEFER",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "REWRITE",
]);

const VALID_TAINTS = new Set<Taint>(["SYSTEM", "TRUSTED", "UNTRUSTED"]);

/**
 * URL is the single source of truth for filter state.
 *
 * - Read filters from `?decisionKind=…&taint=…&intentKind=…&intentHash=…`.
 * - Write filters by routing to a new URL — browser back/forward handles
 *   undo for free; deep links share verbatim.
 * - Validate enum-shaped filters at the boundary so a hand-edited URL with
 *   `?decisionKind=ALLOW` doesn't poison downstream code.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AuditQuery>(() => {
    const decisionKind = searchParams.get("decisionKind");
    const taint = searchParams.get("taint");
    return {
      decisionKind:
        decisionKind && VALID_DECISION_KINDS.has(decisionKind as DecisionKind)
          ? (decisionKind as DecisionKind)
          : undefined,
      taint:
        taint && VALID_TAINTS.has(taint as Taint) ? (taint as Taint) : undefined,
      intentKind: searchParams.get("intentKind") ?? undefined,
      refusalCode: searchParams.get("refusalCode") ?? undefined,
      intentHash: searchParams.get("intentHash") ?? undefined,
      since: searchParams.get("since") ?? undefined,
      until: searchParams.get("until") ?? undefined,
    };
  }, [searchParams]);

  const setFilter = (key: keyof AuditQuery, value: string | undefined) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs.length > 0 ? `${pathname}?${qs}` : pathname);
  };

  const clearAll = () => {
    router.push(pathname);
  };

  const hasActiveFilters =
    Boolean(filters.decisionKind) ||
    Boolean(filters.taint) ||
    Boolean(filters.intentKind) ||
    Boolean(filters.refusalCode) ||
    Boolean(filters.intentHash);

  return { filters, setFilter, clearAll, hasActiveFilters };
}
