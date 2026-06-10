"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Lock, TriangleAlert } from "lucide-react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { RevealRows, RevealRow } from "./ChartReveal";
import {
  APPROVAL_REPLICA_CHAIN,
  APPROVAL_REPLICA_CHAIN_INTENT_KIND,
  APPROVAL_REPLICA_HISTORY,
  APPROVAL_REPLICA_PENDING,
  type ApprovalStatus,
} from "@/lib/approval-replica";
import { cn } from "@/lib/cn";

/**
 * ApprovalCenterReplica — an interactive replica of the operator console's
 * Approval Center (ADR-122 + ADR-136): the REQUEST_CONFIRMATION → human-review
 * flow.
 *
 * CLIENT component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable), and exposes three surfaces over committed sample fixtures in
 * `lib/approval-replica` behind a proper tablist (Pending / Resolved / Audit
 * chain — roving arrow-key navigation, aria-selected, aria-controls):
 *
 *   1. Pending queue — REQUEST_CONFIRMATION items awaiting review (prompt,
 *      session, time). No action buttons: this is a display-only projection.
 *   2. Decision history — durable, read-only resolved approvals. `resolvedBy`
 *      is a CLAIMED actor (forgeable header, not a verified identity) and is
 *      labeled "claimed" to stay honest.
 *   3. Audit chain — the request → resolved → resumed lineage for the
 *      supersession sample, anchored on `DEPLOYMENT_ROLLBACK_PARKED_HASH` →
 *      `DEPLOYMENT_ROLLBACK_RESUMED_HASH`. The ledger-backed steps deep-link to
 *      the Decision Detail replica.
 *
 * Interactivity is pure client state (the active tab) over the EXISTING
 * committed fixtures — no fetch, no clock, no RNG, no admin/DB access. Switching
 * a tab toggles which panel is visible; the amber DISPLAY-ONLY banner stays
 * visible in every state.
 *
 * DISPLAY-ONLY banner: mirrors the console's amber disclosure that resolving is
 * a display-only projection — real authorization (single-use token take, parked
 * blob hash verify, kernel re-adjudication) happens in the adopter's adapter
 * (`createApprovalEngine.resolve` → adapter-core `confirm()`). This marketing
 * replica is even further removed: a static display of committed fixtures.
 *
 * The lock icon signals token PRESENCE only; the token VALUE is never carried
 * or rendered.
 */

/** Status-keyed text colour for the approval status pill. */
const STATUS_STYLE: Record<ApprovalStatus, string> = {
  pending: "text-amber-300",
  approved: "text-emerald-300",
  declined: "text-red-300",
  expired: "text-console-muted",
};

/** Closed set of approval-center tabs, in display order. */
type ApprovalTab = "pending" | "resolved" | "audit";

interface ApprovalTabDef {
  readonly id: ApprovalTab;
  readonly label: string;
  /** Count rendered beside the tab label (awaiting / resolved / chain steps). */
  readonly count: number;
}

const APPROVAL_TABS: readonly ApprovalTabDef[] = [
  {
    id: "pending",
    label: "Pending",
    count: APPROVAL_REPLICA_PENDING.length,
  },
  {
    id: "resolved",
    label: "Resolved",
    count: APPROVAL_REPLICA_HISTORY.length,
  },
  {
    id: "audit",
    label: "Audit chain",
    count: APPROVAL_REPLICA_CHAIN.length,
  },
] as const;

export function ApprovalCenterReplica({
  className,
}: {
  readonly className?: string;
}) {
  const [tab, setTab] = useState<ApprovalTab>("pending");
  const tabRefs = useRef<Record<ApprovalTab, HTMLButtonElement | null>>({
    pending: null,
    resolved: null,
    audit: null,
  });

  function focusTab(id: ApprovalTab) {
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const order = APPROVAL_TABS.map((t) => t.id);
    const current = order.indexOf(tab);
    let next: ApprovalTab | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = order[(current + 1) % order.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = order[(current - 1 + order.length) % order.length];
    } else if (event.key === "Home") {
      next = order[0];
    } else if (event.key === "End") {
      next = order[order.length - 1];
    }
    if (next) {
      event.preventDefault();
      focusTab(next);
    }
  }

  return (
    <ConsoleChrome caption="approvals · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Approvals · Human Review
          </h2>
          <span className="text-[10px] text-console-muted">
            ADR-122 · ADR-136
          </span>
        </header>

        {/* Amber DISPLAY-ONLY banner — mirrors the console disclosure. ALWAYS
            visible, in every tab state. */}
        <div
          data-testid="approvals-display-only-banner"
          className="flex gap-2.5 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90"
        >
          <TriangleAlert
            size={14}
            className="mt-0.5 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <p>
            <span className="font-medium text-amber-200">Display only.</span>{" "}
            Resolving updates the operator view only. Real authorization runs in
            the adopter&apos;s adapter — single-use token take, parked-blob hash
            verification, and kernel re-adjudication (approval engine →
            adapter-core confirm()).
          </p>
        </div>

        {/* Tablist — Pending / Resolved / Audit chain. Roving arrow-key nav. */}
        <div
          role="tablist"
          aria-label="Approval center views"
          aria-orientation="horizontal"
          className="flex flex-wrap gap-1 border-b border-console-edge"
        >
          {APPROVAL_TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                role="tab"
                type="button"
                id={`approvals-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`approvals-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={onKeyDown}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[10px] uppercase tracking-section transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
                  selected
                    ? "border-emerald-400/70 text-console-ink"
                    : "border-transparent text-console-muted hover:text-console-muted",
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-sm px-1 py-0.5 text-[9px] tabular-nums",
                    selected
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-console-edge/50 text-console-muted",
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Panel A — Pending queue. */}
        <section
          role="tabpanel"
          id="approvals-panel-pending"
          aria-labelledby="approvals-tab-pending"
          hidden={tab !== "pending"}
          className="flex flex-col gap-2"
        >
          <header className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[10px] uppercase tracking-section text-console-muted">
                Pending queue
              </h3>
              <span className="text-[10px] tabular-nums text-console-muted">
                {APPROVAL_REPLICA_PENDING.length} awaiting review
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-console-muted">
              Each item is a REQUEST_CONFIRMATION — the AI system paused and asked
              a human to confirm before it executes a risky action.
            </p>
          </header>
          <div className="overflow-hidden rounded-sm border border-console-edge bg-console-panel/40">
            {APPROVAL_REPLICA_PENDING.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] italic text-console-muted">
                No approval requests.
              </p>
            ) : (
              <RevealRows as="ul" className="divide-y divide-console-edge/50">
                {APPROVAL_REPLICA_PENDING.map((a) => (
                  <RevealRow as="li" key={a.id} className="flex flex-col gap-1 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-console-muted">
                        {a.intentKind}
                      </span>
                      <span className="text-[10px] uppercase tracking-section text-amber-300">
                        pending
                      </span>
                    </div>
                    <p
                      className="text-[11px] text-console-ink"
                      aria-label={`Awaiting human review — the AI system requested confirmation before executing this action: ${a.prompt}`}
                    >
                      {a.prompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-console-muted">
                      <span className="font-mono">{a.sessionId}</span>
                      <time title={a.requestedAt} className="tabular-nums">
                        {formatClock(a.requestedAt)}
                      </time>
                    </div>
                  </RevealRow>
                ))}
              </RevealRows>
            )}
          </div>
        </section>

        {/* Panel B — Decision history. */}
        <section
          role="tabpanel"
          id="approvals-panel-resolved"
          aria-labelledby="approvals-tab-resolved"
          hidden={tab !== "resolved"}
          className="flex flex-col gap-2"
        >
          <h3 className="text-[10px] uppercase tracking-section text-console-muted">
            Decision history
          </h3>
          <div className="overflow-auto rounded-sm border border-console-edge bg-console-panel/40">
            <table className="w-full border-collapse text-left text-[11px]">
              <caption className="px-3 py-1.5 text-left text-[10px] uppercase tracking-section text-console-muted">
                Resolved approvals — read-only
              </caption>
              <thead>
                <tr className="border-b border-console-edge text-console-muted">
                  <th scope="col" className="px-3 py-1 font-normal">
                    Intent
                  </th>
                  <th scope="col" className="px-3 py-1 font-normal">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-1 font-normal">
                    Resolved
                  </th>
                  <th scope="col" className="px-3 py-1 font-normal">
                    Claimed actor
                  </th>
                </tr>
              </thead>
              <tbody>
                {APPROVAL_REPLICA_HISTORY.map((e) => (
                  <tr key={e.id} className="border-t border-console-edge/40">
                    <th
                      scope="row"
                      className="px-3 py-1 text-left font-mono font-normal text-console-muted"
                    >
                      {e.intentKind}
                    </th>
                    <td className="px-3 py-1">
                      <span
                        className={cn(
                          "uppercase tracking-section",
                          STATUS_STYLE[e.status],
                        )}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-3 py-1 tabular-nums text-console-muted">
                      <time title={e.resolvedAt}>
                        {formatClock(e.resolvedAt)}
                      </time>
                    </td>
                    <td className="px-3 py-1 text-console-ink">
                      {/* CLAIMED actor — forgeable header until OIDC. */}
                      <span title="Claimed actor — attested via a forgeable header, not a verified identity (ADR-136)">
                        {e.resolvedBy}
                        <span className="ml-1 rounded-sm border border-amber-400/40 px-1 py-0.5 text-[9px] uppercase tracking-section text-amber-300">
                          claimed
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Panel C — Audit chain (request → resolved → resumed). */}
        <section
          role="tabpanel"
          id="approvals-panel-audit"
          aria-labelledby="approvals-tab-audit"
          hidden={tab !== "audit"}
          className="flex flex-col gap-2"
        >
          <h3 className="flex items-baseline justify-between text-[10px] uppercase tracking-section text-console-muted">
            <span>Audit chain</span>
            <span className="font-mono normal-case tracking-normal text-console-muted">
              {APPROVAL_REPLICA_CHAIN_INTENT_KIND}
            </span>
          </h3>
          <div className="rounded-sm border border-console-edge bg-console-panel/40 px-3 py-2">
            <RevealRows
              as="ol"
              className="flex flex-col gap-1.5"
              data-testid="approval-chain-steps"
            >
              {APPROVAL_REPLICA_CHAIN.map((step, i) => (
                <RevealRow
                  as="li"
                  key={`${step.kind}-${i}`}
                  className="rounded-sm border border-console-edge/50 px-2 py-1.5 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-console-ink">
                      {step.label}
                    </span>
                    <span className="flex items-center gap-2">
                      {step.tokenPresent ? (
                        <Lock
                          size={11}
                          className="text-console-faint"
                          aria-label="confirmation token present"
                        />
                      ) : null}
                      {step.status ? (
                        <span
                          className={cn(
                            "uppercase tracking-section",
                            STATUS_STYLE[step.status],
                          )}
                        >
                          {step.status}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-console-muted">
                    <time title={step.at} className="tabular-nums">
                      {formatClock(step.at)}
                    </time>
                    {step.supersedesReason ? (
                      <span className="font-mono">{step.supersedesReason}</span>
                    ) : null}
                    {step.actor ? (
                      <span title="Claimed actor — attested via a forgeable header, not a verified identity (ADR-136)">
                        by {step.actor}{" "}
                        <span className="rounded-sm border border-amber-400/40 px-1 py-0.5 text-[9px] uppercase tracking-section text-amber-300">
                          claimed
                        </span>
                      </span>
                    ) : null}
                    {step.intentHash ? (
                      <Link
                        href={`/console/decision/${step.intentHash}`}
                        className="font-mono text-console-muted underline-offset-2 hover:text-console-ink hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        audit record →
                      </Link>
                    ) : null}
                  </div>
                </RevealRow>
              ))}
            </RevealRows>
          </div>
        </section>
      </div>
    </ConsoleChrome>
  );
}

/**
 * Render the fixed ISO timestamp as a stable `HH:MM:SS` clock (UTC). Fixtures
 * carry FIXED literal timestamps, so we format an absolute, deterministic clock
 * rather than a wall-clock "x ago" — the replica must not call a live time
 * source, and SSR/CSR must agree.
 */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}
