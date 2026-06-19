"use client";

import { useState } from "react";
import { Link2, Search } from "lucide-react";
import type { AuditRecordVerification } from "@adjudicate/core";
import { ChainVerifyStatus } from "./ChainVerifyStatus";
import { IntegrityBadge } from "./IntegrityBadge";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import {
  useAuditRecords,
  type DecisionKindFilter,
} from "@/hooks/useAuditRecords";
import { useAuditRecord } from "@/hooks/useAuditRecord";

const DECISION_KINDS: readonly DecisionKindFilter[] = [
  "EXECUTE",
  "REFUSE",
  "DEFER",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "REWRITE",
] as const;

/**
 * 112 — the Audit Explorer surface of the write-isolated Adjudicant (OBSERVER)
 * plane. It BROWSES the append-only audit chain (with a six-outcome decision
 * filter), surfaces a per-row integrity badge + a chain-verify status, and looks
 * up a single record by `intentHash` WITH its integrity verdict.
 *
 * Everything here is a pure READ over the admin SDK's READ-ONLY router: the only
 * procedures it can call (`audit.query`, `audit.byHashVerified`) are `.query`,
 * and the client is typed against `ReadOnlyAdminRouter`, so there is no
 * authorize / weaken / replay-mutate procedure even reachable. Per §B/§C the
 * Inspector-General OBSERVES and INVESTIGATES; LIVE single-record replay is an
 * OPERATOR action (`replay.run`, a mutation) and is intentionally ABSENT on this
 * plane — it lives on the console.
 */
export function AuditExplorer() {
  const [decisionKind, setDecisionKind] = useState<DecisionKindFilter | "">("");
  const list = useAuditRecords({
    limit: 100,
    ...(decisionKind ? { decisionKind } : {}),
  });

  const records = list.data?.records ?? [];
  const verifications = list.data?.verifications;
  const chainIntegrity = list.data?.chainIntegrity;

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Audit Explorer · inspector-general
        </h1>
        <span className="text-[10px] text-faint">read-only · write-isolated</span>
      </header>

      <p className="max-w-prose text-[11px] leading-relaxed text-muted">
        Browse the append-only decision chain, inspect a record by intent hash,
        and read its integrity verdict. This plane only observes — it cannot
        authorize, weaken, or replay-mutate a decision.
      </p>

      <ByHashLookup />

      <ChainVerifyStatus chainIntegrity={chainIntegrity} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[10px] uppercase tracking-section text-faint">
            Decisions
          </h2>
          <label className="flex items-center gap-1.5 text-[10px] text-faint">
            <span className="uppercase tracking-section">Decision</span>
            <select
              data-testid="decision-filter"
              aria-label="Filter by decision kind"
              value={decisionKind}
              onChange={(e) =>
                setDecisionKind(e.target.value as DecisionKindFilter | "")
              }
              className="rounded-sm border border-edge bg-canvas px-1.5 py-0.5 text-[10px] text-ink focus:border-ink/30 focus:outline-none"
            >
              <option value="">all</option>
              {DECISION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <AsyncBoundary
          isLoading={list.isLoading}
          isError={list.isError}
          isEmpty={records.length === 0}
          onRetry={() => void list.refetch()}
          errorMessage="Failed to load audit records."
          emptyFallback={
            <EmptyState
              title="No audit records"
              hint="No decisions match this filter."
            />
          }
        >
          <ul
            data-testid="audit-record-list"
            className="flex flex-col divide-y divide-edge/60 rounded-sm border border-edge"
          >
            {records.map((r, i) => (
              <li
                key={r.intentHash}
                data-testid="audit-record-row"
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-[10px] text-muted">
                    {r.intentHash}
                  </span>
                  <span className="text-[9px] uppercase tracking-section text-faint">
                    {r.envelope.kind} · {r.at}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    data-testid="decision-kind"
                    className="rounded-sm border border-edge px-1.5 py-0.5 text-[9px] uppercase tracking-section text-ink"
                  >
                    {r.decision.kind}
                  </span>
                  <IntegrityBadge
                    verification={verificationAt(verifications, i)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      </section>
    </div>
  );
}

/**
 * Read the index-aligned verdict for a row. The SDK guarantees
 * `verifications.length === records.length` WHEN present; a store that does not
 * verify on read omits the array, in which case every row renders DENY-BY-DEFAULT
 * as "unverified" (never as intact).
 */
function verificationAt(
  verifications: readonly AuditRecordVerification[] | undefined,
  i: number,
): AuditRecordVerification | undefined {
  return verifications?.[i];
}

/**
 * Single-record by-hash lookup with integrity-on-read. Fetches via
 * `audit.byHashVerified` so a tampered record still surfaces its bytes but with a
 * loud tamper badge rather than as authoritative.
 */
function ByHashLookup() {
  const [draft, setDraft] = useState("");
  const [hash, setHash] = useState("");
  const detail = useAuditRecord(hash);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHash(draft.trim());
  };

  return (
    <section className="flex flex-col gap-2 rounded-sm border border-edge bg-panel/30 p-3">
      <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-faint">
        <Search aria-hidden="true" className="h-3 w-3" /> Inspect by intent hash
      </h2>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          data-testid="byhash-input"
          aria-label="Intent hash"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="64-char sha256 intent hash"
          className="min-w-0 flex-1 rounded-sm border border-edge bg-canvas px-2 py-1 font-mono text-[10px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none"
        />
        <button
          type="submit"
          data-testid="byhash-submit"
          className="rounded-sm border border-edge bg-canvas px-3 py-1 text-[10px] uppercase tracking-section text-muted hover:border-ink/30 hover:text-ink focus:border-ink/30 focus:outline-none"
        >
          Inspect
        </button>
      </form>

      {hash.length > 0 ? (
        <AsyncBoundary
          isLoading={detail.isLoading}
          isError={detail.isError}
          isEmpty={detail.data === null}
          onRetry={() => void detail.refetch()}
          errorMessage="Failed to load record."
          emptyFallback={
            <EmptyState
              title="No record found"
              hint="No audit record matches that intent hash."
            />
          }
        >
          {detail.data ? (
            <div
              data-testid="byhash-result"
              className="flex flex-col gap-1.5 rounded-sm border border-edge bg-canvas px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-ink">
                  <Link2 aria-hidden="true" className="h-3 w-3" />
                  {detail.data.record.decision.kind}
                </span>
                <IntegrityBadge verification={detail.data.verification} />
              </div>
              <span className="truncate font-mono text-[10px] text-muted">
                {detail.data.record.intentHash}
              </span>
              <span className="text-[9px] uppercase tracking-section text-faint">
                {detail.data.record.envelope.kind} · {detail.data.record.at}
              </span>
            </div>
          ) : null}
        </AsyncBoundary>
      ) : null}
    </section>
  );
}
