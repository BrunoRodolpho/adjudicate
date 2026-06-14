"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CircleCheck } from "lucide-react";
import { AsyncBoundary, EmptyState } from "@/components/ui";
import { SR_ONLY } from "@/components/charts/BarDistribution";
import {
  useTokenBudgetByTenant,
  useTokenSessions,
} from "@/hooks/useTokenGovernance";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Token Governance (ADR-135, follows ADR-120) — operator surface for token-cost
 * burn-down across tenants and sessions, with a budget-exhaustion timeline.
 *
 * Three sub-views, each wrapped in <AsyncBoundary>:
 *   1. Tenant budgets — per-tenant consumed/limit/remaining with a burn bar.
 *      Over-budget rows highlighted; near-budget (≥80%) amber. Conveyed by
 *      TEXT + ICON, never colour alone.
 *   2. Session budgets — the existing per-session view, now with a tenant chip.
 *   3. Exhaustion timeline — newest-first budget crossings (scope badge,
 *      tenant/session id, consumed/budget).
 *
 * DETERMINISM: this page renders a TELEMETRY store fed by `onTokenUsage`,
 * strictly outside the determinism boundary. Nothing here feeds a kernel
 * decision — enforcement is `createTokenBudgetGuard`, fed by adopter state S.
 */

/** Near-budget threshold (amber) as a fraction of the cap. */
const NEAR_BUDGET = 0.8;

type Band = "ok" | "near" | "over";

function bandFor(consumed: number, budget?: number): Band {
  if (budget === undefined || budget <= 0) return "ok";
  const pct = consumed / budget;
  if (pct >= 1) return "over";
  if (pct >= NEAR_BUDGET) return "near";
  return "ok";
}

/** Read-time USD cost (item 3); "—" when no price table was applied. */
function formatUsd(usd?: number): string {
  return typeof usd === "number" ? `$${usd.toFixed(2)}` : "—";
}

const BAND_STYLE: Record<Band, { text: string; bar: string; label: string }> = {
  ok: { text: "text-ink", bar: "bg-emerald-400/55", label: "within budget" },
  near: { text: "text-amber-300", bar: "bg-amber-400/60", label: "near budget" },
  over: { text: "text-red-300", bar: "bg-red-400/60", label: "over budget" },
};

export default function TokensPage() {
  const [scopeFilter, setScopeFilter] = useState<"all" | "session" | "tenant">(
    "all",
  );

  const tenantView = useTokenBudgetByTenant({ eventLimit: 100 });
  const sessionView = useTokenSessions();

  const tenants = tenantView.data?.tenants ?? [];
  const sessions = sessionView.data?.sessions ?? [];
  const allEvents = tenantView.data?.exhaustionEvents ?? [];
  const events = useMemo(
    () =>
      scopeFilter === "all"
        ? allEvents
        : allEvents.filter((e) => e.scope === scopeFilter),
    [allEvents, scopeFilter],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Token Governance · tenant &amp; session burn-down
        </h1>
        <span className="text-[10px] text-faint">ADR-135 · ADR-120</span>
      </header>

      {/* Sub-view A — Tenant budgets */}
      <section className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between">
          <h2 className="text-[10px] uppercase tracking-section text-faint">
            Tenant budgets
          </h2>
          <span className="text-[10px] tabular-nums text-faint">
            total {tenantView.data?.totalConsumed.toLocaleString() ?? "—"}
          </span>
        </header>
        <div
          className="overflow-hidden rounded-sm border border-edge bg-panel/40"
          data-testid="tenant-budgets"
        >
          <AsyncBoundary
            isLoading={tenantView.isLoading}
            isError={tenantView.isError}
            isEmpty={tenants.length === 0}
            emptyFallback={<EmptyState title="No tenant usage recorded." />}
            errorMessage="Tenant token-budget store not configured. Wire a TokenUsageStore (fed by onTokenUsage) into the route handler context."
          >
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-edge text-left text-faint">
                  <th scope="col" className="px-3 py-1.5 font-normal">Tenant</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Consumed</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Budget</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Remaining</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Cost</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Sessions</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">Burn</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const band = bandFor(t.consumed, t.budget);
                  const style = BAND_STYLE[band];
                  return (
                    <tr
                      key={t.tenantId}
                      data-testid={`tenant-row-${t.tenantId}`}
                      data-band={band}
                      className="border-b border-edge/50 last:border-0"
                    >
                      <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          <BandIcon band={band} />
                          {t.tenantId}
                        </span>
                      </th>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                        {t.consumed.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                        {t.budget?.toLocaleString() ?? "—"}
                      </td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", style.text)}>
                        {t.remaining?.toLocaleString() ?? "—"}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right tabular-nums text-muted"
                        data-testid={`tenant-cost-${t.tenantId}`}
                      >
                        {formatUsd(t.costUsd)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                        {t.sessionCount?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <BurnBar
                          consumed={t.consumed}
                          budget={t.budget}
                          band={band}
                          label={`tenant ${t.tenantId}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AsyncBoundary>
        </div>
      </section>

      {/* Sub-view B — Session budgets */}
      <section className="flex flex-col gap-2">
        <header className="text-[10px] uppercase tracking-section text-faint">
          Session budgets
        </header>
        <div
          className="overflow-hidden rounded-sm border border-edge bg-panel/40"
          data-testid="session-budgets"
        >
          <AsyncBoundary
            isLoading={sessionView.isLoading}
            isError={sessionView.isError}
            isEmpty={sessions.length === 0}
            emptyFallback={<EmptyState title="No session usage recorded." />}
            errorMessage="Token-budget telemetry not configured."
          >
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-edge text-left text-faint">
                  <th scope="col" className="px-3 py-1.5 font-normal">Session</th>
                  <th scope="col" className="px-3 py-1.5 font-normal">Tenant</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Consumed</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Budget</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Remaining</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const band = bandFor(s.consumed, s.budget);
                  const style = BAND_STYLE[band];
                  return (
                    <tr
                      key={s.sessionId}
                      data-testid={`session-row-${s.sessionId}`}
                      data-band={band}
                      className="border-b border-edge/50 last:border-0"
                    >
                      <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          <BandIcon band={band} />
                          {s.sessionId}
                        </span>
                      </th>
                      <td className="px-3 py-1.5">
                        {s.tenantId ? (
                          <span className="rounded-sm border border-edge bg-canvas/60 px-1.5 py-0.5 text-[10px] text-muted">
                            {s.tenantId}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                        {s.consumed.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                        {s.budget?.toLocaleString() ?? "—"}
                      </td>
                      <td className={cn("px-3 py-1.5 text-right tabular-nums", style.text)}>
                        {s.remaining?.toLocaleString() ?? "—"}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right tabular-nums text-muted"
                        data-testid={`session-cost-${s.sessionId}`}
                      >
                        {formatUsd(s.costUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AsyncBoundary>
        </div>
      </section>

      {/* Sub-view C — Exhaustion timeline */}
      <section className="flex flex-col gap-2">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[10px] uppercase tracking-section text-faint">
            Budget-exhaustion timeline
          </h2>
          <ScopeFilter value={scopeFilter} onChange={setScopeFilter} />
        </header>
        <div
          className="overflow-hidden rounded-sm border border-edge bg-panel/40"
          data-testid="exhaustion-timeline"
        >
          <AsyncBoundary
            isLoading={tenantView.isLoading}
            isError={tenantView.isError}
            isEmpty={events.length === 0}
            emptyFallback={
              <EmptyState title="No budget exhaustions recorded — usage is within configured caps." />
            }
            errorMessage="Failed to load exhaustion events."
          >
            <ul className="divide-y divide-edge/50">
              {events.map((e) => (
                <li
                  key={e.id}
                  data-testid={`exhaustion-event-${e.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[11px]"
                >
                  <span className="tabular-nums text-muted" title={e.at}>
                    {formatRelative(e.at)}
                  </span>
                  <ScopeBadge scope={e.scope} />
                  <span className="font-mono text-ink">
                    {e.scope === "tenant" ? e.tenantId : e.sessionId}
                  </span>
                  {e.scope === "session" && e.tenantId ? (
                    <span className="rounded-sm border border-edge bg-canvas/60 px-1.5 py-0.5 text-[10px] text-muted">
                      {e.tenantId}
                    </span>
                  ) : null}
                  <span className="ml-auto tabular-nums text-red-300">
                    {e.consumed.toLocaleString()} / {e.budget.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </AsyncBoundary>
        </div>
      </section>
    </div>
  );
}

function BandIcon({ band }: { band: Band }) {
  if (band === "ok") {
    return (
      <>
        <CircleCheck size={12} className="shrink-0 text-emerald-400" aria-hidden />
        <span className={SR_ONLY}>within budget</span>
      </>
    );
  }
  return (
    <>
      <AlertTriangle
        size={12}
        className={cn("shrink-0", band === "over" ? "text-red-300" : "text-amber-300")}
        aria-hidden
      />
      <span className={SR_ONLY}>{BAND_STYLE[band].label}</span>
    </>
  );
}

/**
 * Horizontal burn bar. `role="img"` + `aria-label` carries the full numeric
 * fallback ("tenant acme: 118,600 of 90,000 tokens, 132%, over budget"), so the
 * over/near state never relies on colour alone.
 */
function BurnBar({
  consumed,
  budget,
  band,
  label,
}: {
  consumed: number;
  budget?: number;
  band: Band;
  label: string;
}) {
  const pct =
    budget !== undefined && budget > 0
      ? Math.round((consumed / budget) * 100)
      : 0;
  const widthPct = Math.min(100, Math.max(consumed > 0 ? 2 : 0, pct));
  const aria =
    budget !== undefined
      ? `${label}: ${consumed.toLocaleString()} of ${budget.toLocaleString()} tokens, ${pct}%, ${BAND_STYLE[band].label}`
      : `${label}: ${consumed.toLocaleString()} tokens, no budget configured`;
  return (
    <div
      role="img"
      aria-label={aria}
      className="h-2 w-full min-w-[80px] overflow-hidden rounded-sm bg-canvas"
    >
      <div
        className={cn("h-full rounded-sm", BAND_STYLE[band].bar)}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}

function ScopeBadge({ scope }: { scope: "session" | "tenant" }) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-section",
        scope === "tenant"
          ? "bg-fuchsia-400/15 text-fuchsia-300"
          : "bg-sky-400/15 text-sky-300",
      )}
    >
      {scope}
    </span>
  );
}

function ScopeFilter({
  value,
  onChange,
}: {
  value: "all" | "session" | "tenant";
  onChange: (v: "all" | "session" | "tenant") => void;
}) {
  const id = "exhaustion-scope-filter";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] uppercase tracking-section text-faint">
        Scope
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as "all" | "session" | "tenant")}
        className="rounded-sm border border-edge bg-canvas px-2 py-1 text-[11px] text-ink focus:border-ink/30 focus:outline-none"
      >
        <option value="all">All</option>
        <option value="session">Session</option>
        <option value="tenant">Tenant</option>
      </select>
    </div>
  );
}
