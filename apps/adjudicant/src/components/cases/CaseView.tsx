"use client";

import { GitBranch, Layers, Target } from "lucide-react";
import { IntegrityBadge } from "@/components/audit/IntegrityBadge";
import { EmptyState } from "@/components/ui";
import type { CaseLinkReason, CorrelatedCase } from "@/lib/case-correlation";

export interface CaseViewProps {
  /** The correlated case to render (from `useCase` / `correlateCase`). */
  caseData: CorrelatedCase;
}

const REASON_LABEL: Record<CaseLinkReason, string> = {
  seed: "seed",
  same_session: "same session",
  lineage_predecessor: "predecessor",
  lineage_successor: "successor",
};

/**
 * 113 — renders a correlated CASE as a read-only timeline for the Investigations
 * surface of the Adjudicant (Inspector-General) OBSERVER plane.
 *
 * It surfaces, for each correlated record: its decision kind, intent kind,
 * timestamp, why it belongs to the case (seed / same session / lineage), and its
 * DENY-BY-DEFAULT integrity badge — so a tampered record renders with a loud
 * tamper badge rather than as authoritative (§C: a read only ADDS friction). It
 * makes NO decision and changes NO record: a pure presentation of correlated
 * FACTS. The case correlation itself is pure (`correlateCase`); nothing here can
 * authorize, weaken, or replay-mutate a decision.
 */
export function CaseView({ caseData }: CaseViewProps) {
  if (!caseData.seedFound) {
    return (
      <EmptyState
        title="No case found"
        hint="No audit record matches that intent hash in the current window."
      />
    );
  }

  return (
    <section
      data-testid="case-view"
      data-session={caseData.sessionId ?? ""}
      className="flex flex-col gap-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-2">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-faint">
          <Layers aria-hidden="true" className="h-3 w-3" /> Correlated case
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-faint">
          <span className="flex items-center gap-1">
            <Target aria-hidden="true" className="h-3 w-3" />
            session{" "}
            <span data-testid="case-session" className="font-mono text-muted">
              {caseData.sessionId ?? "—"}
            </span>
          </span>
          <span data-testid="case-member-count">
            {caseData.members.length} record
            {caseData.members.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <ol
        data-testid="case-timeline"
        className="flex flex-col divide-y divide-edge/60 rounded-sm border border-edge"
      >
        {caseData.members.map((member) => {
          const r = member.record;
          const isSeed = member.reason === "seed";
          return (
            <li
              key={r.intentHash}
              data-testid="case-member"
              data-reason={member.reason}
              aria-current={isSeed ? "true" : undefined}
              className={
                isSeed
                  ? "flex items-center justify-between gap-3 bg-edge/30 px-3 py-2"
                  : "flex items-center justify-between gap-3 px-3 py-2"
              }
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-[10px] text-muted">
                  {r.intentHash}
                </span>
                <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-section text-faint">
                  <span>
                    {r.envelope.kind} · {r.at}
                  </span>
                  {r.supersedes ? (
                    <span
                      className="flex items-center gap-0.5 text-faint"
                      title={`supersedes ${r.supersedes.predecessorIntentHash} (${r.supersedes.reason})`}
                    >
                      <GitBranch aria-hidden="true" className="h-2.5 w-2.5" />
                      {r.supersedes.reason.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  data-testid="case-link-reason"
                  className="rounded-sm border border-edge px-1.5 py-0.5 text-[9px] uppercase tracking-section text-faint"
                >
                  {REASON_LABEL[member.reason]}
                </span>
                <span
                  data-testid="case-decision-kind"
                  className="rounded-sm border border-edge px-1.5 py-0.5 text-[9px] uppercase tracking-section text-ink"
                >
                  {r.decision.kind}
                </span>
                <IntegrityBadge verification={member.verification} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
