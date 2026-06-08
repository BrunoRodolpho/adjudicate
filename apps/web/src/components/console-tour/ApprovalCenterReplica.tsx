import Link from "next/link";
import { Lock, TriangleAlert } from "lucide-react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import {
  APPROVAL_REPLICA_CHAIN,
  APPROVAL_REPLICA_CHAIN_INTENT_KIND,
  APPROVAL_REPLICA_HISTORY,
  APPROVAL_REPLICA_PENDING,
  type ApprovalStatus,
} from "@/lib/approval-replica";
import { cn } from "@/lib/cn";

/**
 * ApprovalCenterReplica — a static replica of the operator console's Approval
 * Center (ADR-122 + ADR-136): the REQUEST_CONFIRMATION → human-review flow.
 *
 * SERVER component. It renders inside {@link ConsoleChrome} (the reviewed
 * honesty boundary — the standing "Illustrative replica · sample data" label is
 * non-removable), and shows three surfaces over committed sample fixtures in
 * `lib/approval-replica`:
 *
 *   1. Pending queue — REQUEST_CONFIRMATION items awaiting review (prompt,
 *      session, time). No action buttons: this is a static display.
 *   2. Decision history — durable, read-only resolved approvals. `resolvedBy`
 *      is a CLAIMED actor (forgeable header, not a verified identity) and is
 *      labeled "claimed" to stay honest.
 *   3. Audit chain — the request → resolved → resumed lineage for the
 *      supersession sample, anchored on `DEPLOYMENT_ROLLBACK_PARKED_HASH` →
 *      `DEPLOYMENT_ROLLBACK_RESUMED_HASH`. The ledger-backed steps deep-link to
 *      the Decision Detail replica.
 *
 * DISPLAY-ONLY banner: mirrors the console's amber disclosure that resolving is
 * a display-only projection — real authorization (single-use token take, parked
 * blob hash verify, kernel re-adjudication) happens in the adopter's adapter
 * (`createApprovalEngine.resolve` → adapter-core `confirm()`). This marketing
 * replica is even further removed: a static display with no interactivity.
 *
 * No clock, no RNG, no network, no admin/DB access — fixed literals only. The
 * lock icon signals token PRESENCE only; the token VALUE is never carried or
 * rendered.
 */

/** Status-keyed text colour for the approval status pill. */
const STATUS_STYLE: Record<ApprovalStatus, string> = {
  pending: "text-amber-300",
  approved: "text-emerald-300",
  declined: "text-red-300",
  expired: "text-console-faint",
};

export function ApprovalCenterReplica({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <ConsoleChrome caption="approvals · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Approvals · Human Review
          </h2>
          <span className="text-[10px] text-console-faint">
            ADR-122 · ADR-136
          </span>
        </header>

        {/* Amber DISPLAY-ONLY banner — mirrors the console disclosure. */}
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

        {/* Sub-view A — Pending queue. */}
        <section className="flex flex-col gap-2">
          <header className="flex items-baseline justify-between">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Pending queue
            </h3>
            <span className="text-[10px] tabular-nums text-console-faint">
              {APPROVAL_REPLICA_PENDING.length} awaiting review
            </span>
          </header>
          <div className="overflow-hidden rounded-sm border border-console-edge bg-console-panel/40">
            {APPROVAL_REPLICA_PENDING.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] italic text-console-faint">
                No approval requests.
              </p>
            ) : (
              <ul className="divide-y divide-console-edge/50">
                {APPROVAL_REPLICA_PENDING.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-console-muted">
                        {a.intentKind}
                      </span>
                      <span className="text-[10px] uppercase tracking-section text-amber-300">
                        pending
                      </span>
                    </div>
                    <p className="text-[11px] text-console-ink">{a.prompt}</p>
                    <div className="flex flex-wrap items-center gap-x-3 text-[10px] text-console-faint">
                      <span className="font-mono">{a.sessionId}</span>
                      <time title={a.requestedAt} className="tabular-nums">
                        {formatClock(a.requestedAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Sub-views B & C — history + audit chain, side by side on wide screens. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Decision history. */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Decision history
            </h3>
            <div className="overflow-auto rounded-sm border border-console-edge bg-console-panel/40">
              <table className="w-full border-collapse text-left text-[11px]">
                <caption className="px-3 py-1.5 text-left text-[10px] uppercase tracking-section text-console-faint">
                  Resolved approvals — read-only
                </caption>
                <thead>
                  <tr className="border-b border-console-edge text-console-faint">
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
                    <tr
                      key={e.id}
                      className="border-t border-console-edge/40"
                    >
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
                      <td className="px-3 py-1 tabular-nums text-console-faint">
                        <time title={e.resolvedAt}>
                          {formatClock(e.resolvedAt)}
                        </time>
                      </td>
                      <td className="px-3 py-1 text-console-ink">
                        {/* CLAIMED actor — forgeable header until OIDC. */}
                        <span title="Claimed actor — attested via a forgeable header, not a verified identity (ADR-136)">
                          {e.resolvedBy}
                          <span className="ml-1 text-[9px] uppercase tracking-section text-console-faint">
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

          {/* Audit chain — request → resolved → resumed. */}
          <section className="flex flex-col gap-2">
            <h3 className="flex items-baseline justify-between text-[10px] uppercase tracking-section text-console-faint">
              <span>Audit chain</span>
              <span className="font-mono normal-case tracking-normal text-console-faint">
                {APPROVAL_REPLICA_CHAIN_INTENT_KIND}
              </span>
            </h3>
            <div className="rounded-sm border border-console-edge bg-console-panel/40 px-3 py-2">
              <ol
                className="flex flex-col gap-1.5"
                data-testid="approval-chain-steps"
              >
                {APPROVAL_REPLICA_CHAIN.map((step, i) => (
                  <li
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
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-console-faint">
                      <time title={step.at} className="tabular-nums">
                        {formatClock(step.at)}
                      </time>
                      {step.supersedesReason ? (
                        <span className="font-mono">
                          {step.supersedesReason}
                        </span>
                      ) : null}
                      {step.actor ? (
                        <span title="Claimed actor — forgeable header, not a verified identity (ADR-136)">
                          by {step.actor}{" "}
                          <span className="text-[9px] uppercase tracking-section">
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
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
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
