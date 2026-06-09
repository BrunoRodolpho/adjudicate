"use client";

import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { DrawOnScroll } from "@/components/motion/DrawOnScroll";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * MagicMomentSplit — the animated "Risk → Fix" split-screen.
 *
 * Thin CLIENT presentational component. All numbers/hashes are computed by the
 * real kernel in the parent server component (MagicMoment) and passed in as
 * plain props — this file does no kernel work and holds no state.
 *
 * The two panes cascade in via <Stagger> (left "proposes" first, then the
 * connector, then right "decides", then the receipt line), so the eye travels
 * danger → fix. A small drawn arrow (DrawOnScroll) bridges the panes on desktop
 * to reinforce the left→right rewrite.
 *
 * Reduced-motion-safe: every animated wrapper (Stagger, DrawOnScroll) degrades
 * to a plain, fully-visible element under prefers-reduced-motion — the panes
 * simply render side-by-side, fully drawn, no cascade. Transform/opacity only;
 * the grid reserves its space from first paint, so there is no layout shift.
 */

export function MagicMomentSplit({
  environment,
  proposedRamp,
  rewrittenRamp,
  auditHashShort,
  real,
}: {
  readonly environment: string;
  readonly proposedRamp: number;
  readonly rewrittenRamp: number;
  readonly auditHashShort: string;
  readonly real: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Stagger
        className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
        stagger={0.12}
      >
        {/* LEFT — what the agent proposed (danger-tinted). */}
        <StaggerItem className="h-full">
          <article
            aria-label="The action the agent proposed"
            className="flex h-full flex-col gap-4 rounded-2xl border-2 border-dashed border-refuse/50 bg-refuse/5 p-5 shadow-sm"
          >
            <header className="flex items-center gap-2">
              <AlertTriangle
                size={16}
                className="shrink-0 text-refuse"
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] uppercase tracking-section text-refuse">
                The agent proposes
              </span>
            </header>
            <dl className="flex flex-col gap-2 font-mono text-[12px] leading-relaxed">
              <Row label="environment" value={environment} danger />
              <Row label="rampPercent" value={String(proposedRamp)} danger />
              <Row label="approval" value="none recorded" danger />
            </dl>
            <p className="mt-auto text-[13px] leading-snug text-muted">
              A full-traffic production rollout, unreviewed. With block-or-allow,
              your only options are <em>let it ship</em> or <em>halt the
              agent</em>.
            </p>
          </article>
        </StaggerItem>

        {/* CONNECTOR — drawn arrow on desktop; chip on mobile. */}
        <StaggerItem className="flex items-center justify-center">
          <span className="sr-only">rewritten to</span>
          {/* Desktop: a drawn left→right arrow bridging the panes. */}
          <DrawOnScroll
            viewBox="0 0 56 24"
            className="hidden h-6 w-14 text-rewrite-strong lg:block"
            aria-hidden="true"
            fill="none"
          >
            <DrawOnScroll.Path
              d="M2 12 H46"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <DrawOnScroll.Path
              d="M40 6 L48 12 L40 18"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </DrawOnScroll>
          {/* Mobile/stacked: a downward chevron, decoration only. */}
          <ArrowRight
            size={22}
            aria-hidden="true"
            className="rotate-90 text-rewrite-strong lg:hidden"
          />
        </StaggerItem>

        {/* RIGHT — what adjudicate decided (safe-tinted). */}
        <StaggerItem className="h-full">
          <article
            aria-label="The decision adjudicate returned"
            className="flex h-full flex-col gap-4 rounded-2xl border border-execute/40 bg-execute/5 p-5 shadow-sm"
          >
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  className="shrink-0 text-execute"
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] uppercase tracking-section text-execute">
                  adjudicate decides
                </span>
              </div>
              <DecisionChip kind="REWRITE" size="sm" />
            </header>
            <dl className="flex flex-col gap-2 font-mono text-[12px] leading-relaxed">
              <Row label="environment" value={environment} />
              <Row
                label="rampPercent"
                value={String(rewrittenRamp)}
                rewrite
                struck={String(proposedRamp)}
              />
              <Row label="basis" value="quantity_capped" />
            </dl>
            <p className="text-[13px] leading-snug text-muted">
              The kernel returns a{" "}
              <span className="font-semibold text-rewrite-strong">REWRITE</span>{" "}
              — a safer action that still ships — clamping the ramp from{" "}
              {proposedRamp}% to {rewrittenRamp}%.
            </p>
          </article>
        </StaggerItem>
      </Stagger>

      {/* Compact, REAL receipt line — proves the decision is recorded. */}
      <Stagger className="flex flex-col gap-3" delay={0.36}>
        <StaggerItem>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-edge bg-canvas px-4 py-3 font-mono text-[11px]">
            <span className="uppercase tracking-section text-muted">
              receipt
            </span>
            <DecisionChip kind="REWRITE" size="sm" />
            <span className="text-muted">
              auditHash{" "}
              <span className="font-semibold text-ink">{auditHashShort}</span>
            </span>
            <span className="text-faint">· signed · append-only</span>
          </div>
        </StaggerItem>
      </Stagger>

      {/* Caption + CTA. */}
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-muted">
          {real ? (
            <>This ran on the real kernel, server-side — not a mockup.</>
          ) : (
            <>
              Built from the kernel&apos;s own primitives — the same decision the
              real kernel returns.
            </>
          )}
        </p>
        <Button href="/playground" variant="primary">
          See the full decision <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  danger,
  rewrite,
  struck,
}: {
  readonly label: string;
  readonly value: string;
  readonly danger?: boolean;
  readonly rewrite?: boolean;
  /** When set, shows the prior value struck-through before the new one. */
  readonly struck?: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-[110px] flex-none text-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words",
          danger && "font-semibold text-refuse",
          rewrite && "font-semibold text-rewrite-strong",
          !danger && !rewrite && "text-ink/85",
        )}
      >
        {struck ? (
          <span className="mr-1.5 text-faint line-through">{struck}</span>
        ) : null}
        {value}
      </dd>
    </div>
  );
}
