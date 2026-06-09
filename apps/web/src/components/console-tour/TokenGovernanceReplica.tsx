"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CircleCheck } from "lucide-react";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { RevealRows, RevealRow } from "./ChartReveal";
import { EASE_OUT, REVEAL_VIEWPORT } from "@/lib/motion";
import { SR_ONLY } from "@/components/console-kit/charts/BarDistribution";
import {
  bandFor,
  TOKEN_BAND_LABEL,
  TOKEN_REPLICA_EXHAUSTION_EVENTS,
  TOKEN_REPLICA_SESSIONS,
  TOKEN_REPLICA_TENANTS,
  TOKEN_REPLICA_TOTAL_CONSUMED,
  type TokenBand,
} from "@/lib/token-replica";
import { cn } from "@/lib/cn";

/**
 * TokenGovernanceReplica — a replica of the operator console's Token Governance
 * surface (ADR-135, follows ADR-120).
 *
 * CLIENT component. Interactivity is local React state over committed sample
 * fixtures ONLY — no network, no clock, no RNG, no admin/DB access; every value
 * is a fixed literal so the surface renders deterministically. It renders inside
 * {@link ConsoleChrome} (the reviewed honesty boundary — the standing
 * "Illustrative replica · sample data" label is non-removable):
 *
 *   0. Scope filter — a segmented control (All / Tenant / Session) that scopes
 *      the budget-exhaustion timeline AND the budget tables to that scope. It is
 *      a labelled `role="radiogroup"` of `aria-checked` buttons, keyboard-able.
 *   1. Tenant budgets — per-tenant consumed/budget/remaining with a horizontal
 *      BurnBar, banded ok/near/over. The band is conveyed by ICON + LABEL,
 *      never colour alone (a11y).
 *   2. Session budgets — per-session rows with a tenant chip.
 *   3. Budget-exhaustion timeline — newest-first budget crossings (scope badge,
 *      synthetic id, consumed/budget), filtered to the chosen scope.
 *
 * apps/web reads no DATABASE_URL/REDIS_URL/admin token and fetches no /api/admin
 * or SSE endpoint. All tenant/session ids are SYNTHETIC and anonymous
 * (`tenant-demo`, `sess-alpha`) — they map to no real customer.
 */

/** Band-keyed presentation. Colour is paired with an icon + label, never alone. */
const BAND_STYLE: Record<TokenBand, { text: string; bar: string }> = {
  ok: { text: "text-console-ink", bar: "bg-emerald-400/55" },
  near: { text: "text-amber-300", bar: "bg-amber-400/60" },
  over: { text: "text-red-300", bar: "bg-red-400/60" },
};

/** The exhaustion-scope filter. "all" shows both scopes. */
type ScopeFilter = "all" | "tenant" | "session";

const SCOPE_OPTIONS: readonly { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tenant", label: "Tenant" },
  { value: "session", label: "Session" },
];

export function TokenGovernanceReplica({
  className,
}: {
  readonly className?: string;
}) {
  const [scope, setScope] = useState<ScopeFilter>("all");

  const showTenants = scope !== "session";
  const showSessions = scope !== "tenant";

  const exhaustionEvents = useMemo(
    () =>
      scope === "all"
        ? TOKEN_REPLICA_EXHAUSTION_EVENTS
        : TOKEN_REPLICA_EXHAUSTION_EVENTS.filter((e) => e.scope === scope),
    [scope],
  );

  return (
    <ConsoleChrome caption="tokens · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Token Governance · tenant &amp; session burn-down
          </h2>
          <span className="text-[10px] text-console-faint">
            ADR-135 · ADR-120
          </span>
        </header>

        {/* Scope filter — segmented control scoping the tables + timeline. */}
        <div
          role="radiogroup"
          aria-label="Filter token governance by scope"
          className="inline-flex items-center gap-1 self-start rounded-sm border border-console-edge bg-console-panel/40 p-0.5"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = opt.value === scope;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setScope(opt.value)}
                data-scope={opt.value}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-section transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/60",
                  active
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-console-muted hover:bg-console-edge/40",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Sub-view A — Tenant budgets. */}
        {showTenants ? (
          <section className="flex flex-col gap-2" data-testid="token-tenants">
            <header className="flex items-baseline justify-between">
              <h3 className="text-[10px] uppercase tracking-section text-console-faint">
                Tenant budgets
              </h3>
              <span className="text-[10px] tabular-nums text-console-faint">
                total {TOKEN_REPLICA_TOTAL_CONSUMED.toLocaleString()}
              </span>
            </header>
            <div className="overflow-auto rounded-sm border border-console-edge bg-console-panel/40">
              <table className="w-full border-collapse text-[11px]">
                <caption className={SR_ONLY}>
                  Per-tenant token budgets, with a burn bar banded within / near
                  / over budget.
                </caption>
                <thead>
                  <tr className="border-b border-console-edge text-left text-console-faint">
                    <Th>Tenant</Th>
                    <Th align="right">Consumed</Th>
                    <Th align="right">Budget</Th>
                    <Th align="right">Remaining</Th>
                    <Th align="right">Sessions</Th>
                    <Th>Burn</Th>
                  </tr>
                </thead>
                <RevealRows as="tbody">
                  {TOKEN_REPLICA_TENANTS.map((t) => {
                    const band = bandFor(t.consumed, t.budget);
                    const style = BAND_STYLE[band];
                    return (
                      <RevealRow
                        as="tr"
                        key={t.tenantId}
                        data-band={band}
                        className="border-b border-console-edge/50 last:border-0"
                      >
                        <th
                          scope="row"
                          className="px-3 py-1.5 text-left font-mono font-normal text-console-ink"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <BandIcon band={band} />
                            {t.tenantId}
                          </span>
                        </th>
                        <td className="px-3 py-1.5 text-right tabular-nums text-console-ink">
                          {t.consumed.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-console-muted">
                          {t.budget?.toLocaleString() ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right tabular-nums",
                            style.text,
                          )}
                        >
                          {t.remaining?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-console-muted">
                          {t.sessionCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5">
                          <BurnBar
                            consumed={t.consumed}
                            budget={t.budget}
                            band={band}
                            label={`tenant ${t.tenantId}`}
                          />
                        </td>
                      </RevealRow>
                    );
                  })}
                </RevealRows>
              </table>
            </div>
          </section>
        ) : null}

        {/* Sub-view B — Session budgets. */}
        {showSessions ? (
          <section className="flex flex-col gap-2" data-testid="token-sessions">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Session budgets
            </h3>
            <div className="overflow-auto rounded-sm border border-console-edge bg-console-panel/40">
              <table className="w-full border-collapse text-[11px]">
                <caption className={SR_ONLY}>
                  Per-session token budgets, tagged to their tenant, banded
                  within / near / over budget.
                </caption>
                <thead>
                  <tr className="border-b border-console-edge text-left text-console-faint">
                    <Th>Session</Th>
                    <Th>Tenant</Th>
                    <Th align="right">Consumed</Th>
                    <Th align="right">Budget</Th>
                    <Th align="right">Remaining</Th>
                  </tr>
                </thead>
                <RevealRows as="tbody">
                  {TOKEN_REPLICA_SESSIONS.map((s) => {
                    const band = bandFor(s.consumed, s.budget);
                    const style = BAND_STYLE[band];
                    return (
                      <RevealRow
                        as="tr"
                        key={s.sessionId}
                        data-band={band}
                        className="border-b border-console-edge/50 last:border-0"
                      >
                        <th
                          scope="row"
                          className="px-3 py-1.5 text-left font-mono font-normal text-console-ink"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <BandIcon band={band} />
                            {s.sessionId}
                          </span>
                        </th>
                        <td className="px-3 py-1.5">
                          {s.tenantId ? (
                            <span className="rounded-sm border border-console-edge bg-console-canvas/60 px-1.5 py-0.5 text-[10px] text-console-muted">
                              {s.tenantId}
                            </span>
                          ) : (
                            <span className="text-console-faint">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-console-ink">
                          {s.consumed.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-console-muted">
                          {s.budget?.toLocaleString() ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 text-right tabular-nums",
                            style.text,
                          )}
                        >
                          {s.remaining?.toLocaleString() ?? "—"}
                        </td>
                      </RevealRow>
                    );
                  })}
                </RevealRows>
              </table>
            </div>
          </section>
        ) : null}

        {/* Sub-view C — Budget-exhaustion timeline, scoped to the filter. */}
        <section className="flex flex-col gap-2" data-testid="token-exhaustion">
          <header className="flex items-baseline justify-between">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Budget-exhaustion timeline
            </h3>
            {scope !== "all" ? (
              <span className="text-[10px] uppercase tracking-section text-console-faint">
                {scope}-scope crossings
              </span>
            ) : null}
          </header>
          <div className="overflow-hidden rounded-sm border border-console-edge bg-console-panel/40">
            {exhaustionEvents.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] italic text-console-faint">
                {scope === "all"
                  ? "No budget exhaustions recorded — usage is within configured caps."
                  : `No ${scope}-scope budget exhaustions recorded in this window.`}
              </p>
            ) : (
              <RevealRows as="ul" className="divide-y divide-console-edge/50">
                {exhaustionEvents.map((e) => (
                  <RevealRow
                    as="li"
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[11px]"
                  >
                    <time
                      title={e.at}
                      className="tabular-nums text-console-muted"
                    >
                      {formatClock(e.at)}
                    </time>
                    <ScopeBadge scope={e.scope} />
                    <span className="font-mono text-console-ink">
                      {e.scope === "tenant" ? e.tenantId : e.sessionId}
                    </span>
                    {e.scope === "session" && e.tenantId ? (
                      <span className="rounded-sm border border-console-edge bg-console-canvas/60 px-1.5 py-0.5 text-[10px] text-console-muted">
                        {e.tenantId}
                      </span>
                    ) : null}
                    <span className="ml-auto tabular-nums text-red-300">
                      {e.consumed.toLocaleString()} / {e.budget.toLocaleString()}
                    </span>
                  </RevealRow>
                ))}
              </RevealRows>
            )}
          </div>
        </section>
      </div>
    </ConsoleChrome>
  );
}

/** Faint uppercase column header cell. */
function Th({
  children,
  align = "left",
}: {
  readonly children: React.ReactNode;
  readonly align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-1.5 text-[10px] font-normal uppercase tracking-section text-console-faint",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

/**
 * Band icon + visually-hidden band label, so the over/near/ok state is conveyed
 * by ICON + TEXT, never colour alone.
 */
function BandIcon({ band }: { readonly band: TokenBand }) {
  if (band === "ok") {
    return (
      <>
        <CircleCheck
          size={12}
          className="shrink-0 text-emerald-400"
          aria-hidden="true"
        />
        <span className={SR_ONLY}>{TOKEN_BAND_LABEL.ok}</span>
      </>
    );
  }
  return (
    <>
      <AlertTriangle
        size={12}
        className={cn(
          "shrink-0",
          band === "over" ? "text-red-300" : "text-amber-300",
        )}
        aria-hidden="true"
      />
      <span className={SR_ONLY}>{TOKEN_BAND_LABEL[band]}</span>
    </>
  );
}

/**
 * Horizontal burn bar. `role="img"` + `aria-label` carries the full numeric
 * fallback ("tenant tenant-stress: 118,600 of 90,000 tokens, 132%, over
 * budget"), so the over/near state never relies on colour alone.
 */
function BurnBar({
  consumed,
  budget,
  band,
  label,
}: {
  readonly consumed: number;
  readonly budget?: number;
  readonly band: TokenBand;
  readonly label: string;
}) {
  const reduce = useReducedMotion();
  const pct =
    budget !== undefined && budget > 0
      ? Math.round((consumed / budget) * 100)
      : 0;
  const widthPct = Math.min(100, Math.max(consumed > 0 ? 2 : 0, pct));
  const aria =
    budget !== undefined
      ? `${label}: ${consumed.toLocaleString()} of ${budget.toLocaleString()} tokens, ${pct}%, ${TOKEN_BAND_LABEL[band]}`
      : `${label}: ${consumed.toLocaleString()} tokens, no budget configured`;
  const fillClass = cn("h-full origin-left rounded-sm", BAND_STYLE[band].bar);
  return (
    <div
      role="img"
      aria-label={aria}
      className="h-2 w-full min-w-[80px] overflow-hidden rounded-sm bg-console-canvas"
    >
      {/* Fill animates in via scaleX (transform-only — the width is fixed, so
          there is no layout shift). Reduced-motion: rendered at full extent. */}
      {reduce ? (
        <div className={fillClass} style={{ width: `${widthPct}%` }} />
      ) : (
        <motion.div
          className={fillClass}
          style={{ width: `${widthPct}%` }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={REVEAL_VIEWPORT}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        />
      )}
    </div>
  );
}

/** Scope pill — tenant vs session crossing. */
function ScopeBadge({ scope }: { readonly scope: "session" | "tenant" }) {
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

/**
 * Render the fixed ISO timestamp as a stable `HH:MM:SS` clock (UTC). The fixtures
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
