"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { CaseView } from "./CaseView";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { useCase } from "@/hooks/useCase";

/**
 * 113 — the Investigations / cases surface of the write-isolated Adjudicant
 * (Inspector-General) OBSERVER plane.
 *
 * An operator PIVOTS from a single audit record (by `intentHash`) into a
 * correlated CASE view: the records sharing that record's session plus its
 * supersession lineage, rendered as a read-only timeline with per-record
 * integrity badges.
 *
 * Everything here is a pure READ over the admin SDK's READ-ONLY router: the only
 * procedure it can call (`audit.query`, through `useCase`) is `.query`, and the
 * client is typed against `ReadOnlyAdminRouter`, so no authorize / weaken /
 * replay-mutate procedure is even reachable. Per §B/§C the Inspector-General
 * OBSERVES and INVESTIGATES — it composes FACTS, never decisions. There is NO
 * mutation on this surface (114 later adds the ONE friction-monotone escalate).
 */
export function InvestigationsExplorer() {
  const [draft, setDraft] = useState("");
  const [seed, setSeed] = useState("");
  const caseQuery = useCase(seed);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSeed(draft.trim());
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Investigations · inspector-general
        </h1>
        <span className="text-[10px] text-faint">read-only · write-isolated</span>
      </header>

      <p className="max-w-prose text-[11px] leading-relaxed text-muted">
        Pivot from a single audit record into its correlated case — the decisions
        sharing its session and supersession lineage. This plane only observes and
        investigates; it cannot authorize, weaken, or replay-mutate a decision.
      </p>

      <section className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/30 p-3">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-faint">
          <Search aria-hidden="true" className="h-3 w-3" /> Open case from intent
          hash
        </h2>
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            data-testid="case-seed-input"
            aria-label="Seed intent hash"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="64-char sha256 intent hash to investigate"
            className="min-w-0 flex-1 rounded-sm border border-edge bg-canvas px-2 py-1 font-mono text-[10px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none"
          />
          <button
            type="submit"
            data-testid="case-seed-submit"
            className="rounded-sm border border-edge bg-canvas px-3 py-1 text-[10px] uppercase tracking-section text-muted hover:border-ink/30 hover:text-ink focus:border-ink/30 focus:outline-none"
          >
            Investigate
          </button>
        </form>
      </section>

      {seed.length > 0 ? (
        <AsyncBoundary
          isLoading={caseQuery.isLoading}
          isError={caseQuery.isError}
          isEmpty={
            caseQuery.data !== undefined && caseQuery.data.members.length === 0
          }
          onRetry={() => void caseQuery.refetch()}
          errorMessage="Failed to load case."
          emptyFallback={
            <EmptyState
              title="No case found"
              hint="No audit record matches that intent hash in the current window."
            />
          }
        >
          {caseQuery.data ? <CaseView caseData={caseQuery.data} /> : null}
        </AsyncBoundary>
      ) : (
        <EmptyState
          title="No case open"
          hint="Enter an intent hash above to correlate a case."
        />
      )}
    </div>
  );
}
