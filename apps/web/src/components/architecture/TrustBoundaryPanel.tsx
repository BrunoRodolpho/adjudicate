"use client";

import { Callout } from "@/components/ui/Callout";
import { PUBLIC_COHORT_FLOOR } from "@/lib/public-projection";
import { cn } from "@/lib/cn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

/**
 * TrustBoundaryPanel — the side-by-side contrast between the authenticated
 * operator console (apps/console) and this public site (apps/web).
 *
 * The thesis (verified against apps/web/src/app/transparency/page.tsx and the
 * project's dual-app strategy, ADR-128): apps/web holds NO database or Redis
 * credentials by construction, so it cannot leak raw records even in principle.
 * The boundary isn't a limitation of the public site — it's the structural
 * proof that the public surface is trustworthy.
 *
 * Renders as a two-column comparison on wide viewports and a stacked,
 * per-attribute layout on mobile.
 *
 * Motion (AUDIT P1): the body rows fade + rise in a `Stagger` as the panel
 * scrolls into view, so the contrast between the two columns lands one
 * attribute at a time. Each row gets a subtle `motion-safe` hover lift (a
 * tiny translate + shadow, raised above its neighbours via z-index so the
 * shared seams stay clean). Transform/opacity-only — no layout shift, and
 * under `prefers-reduced-motion` the rows render statically with no lift.
 */

interface BoundaryRow {
  readonly label: string;
  readonly console: string;
  readonly web: string;
}

const ROWS: readonly BoundaryRow[] = [
  {
    label: "Data source",
    console:
      "Reads the live Postgres audit mirror (intent_audit) and the Redis AuditEventBus — when the deployment configures them.",
    web: "Committed fixtures + aggregate projections only. Holds NO database URL, NO Redis URL, and NO admin token.",
  },
  {
    label: "Live tail",
    console:
      "Real Server-Sent Events stream pushed from the bus — every durable write appears in the live audit tail.",
    web: "None. There is nothing live to tail; the public views are static aggregate snapshots.",
  },
  {
    label: "Exposure",
    console:
      "Full AuditRecords: envelopes, payloads, basis codes, intent hashes, actors, commands — the complete governance trail.",
    web: `Aggregates only — counts, ratios, closed-enum categories. A <${PUBLIC_COHORT_FLOOR} small-cohort floor and an explicit allowlist mean no raw PII, command text, prompts, tokens, ids, or individual decisions ever cross.`,
  },
  {
    label: "Why it exists",
    console:
      "Operators investigating an incident need ground truth — the exact record, replayable and verifiable.",
    web: "A public site that can leak nothing by construction: it has no credentials to reach the data in the first place.",
  },
];

const COLS: ReadonlyArray<{
  key: "console" | "web";
  title: string;
  sub: string;
  accent: string;
}> = [
  {
    key: "console",
    title: "Operator console",
    sub: "apps/console · :5180",
    accent: "border-escalate/40",
  },
  {
    key: "web",
    title: "This public site",
    sub: "apps/web · :5181",
    accent: "border-execute/40",
  },
];

export function TrustBoundaryPanel({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        {/* Column headers — hidden on mobile, where each row labels its side. */}
        <div className="hidden border-b border-edge md:grid md:grid-cols-[10rem_1fr_1fr]">
          <div className="bg-canvas p-4" />
          {COLS.map((c) => (
            <div
              key={c.key}
              className={cn("border-l-2 bg-canvas p-4", c.accent)}
            >
              <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
              <code className="mt-0.5 block text-[11px] text-muted">
                {c.sub}
              </code>
            </div>
          ))}
        </div>

        <Stagger>
          {ROWS.map((row, idx) => (
            <StaggerItem
              key={row.label}
              className={cn(
                "relative transition-shadow md:grid md:grid-cols-[10rem_1fr_1fr]",
                "motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 hover:z-10 hover:shadow-md",
                idx > 0 && "border-t border-edge",
              )}
            >
              <div className="bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-section text-muted">
                  {row.label}
                </p>
              </div>
              {COLS.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    "border-t border-edge p-4 md:border-l-2 md:border-t-0",
                    c.accent,
                  )}
                >
                  {/* Mobile-only side label. */}
                  <p className="mb-1 text-[11px] font-medium text-ink md:hidden">
                    {c.title}
                    <span className="ml-1.5 font-normal text-muted">
                      {c.sub}
                    </span>
                  </p>
                  <p className="text-sm leading-relaxed text-muted">
                    {row[c.key]}
                  </p>
                </div>
              ))}
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      <Callout
        tone="info"
        title="The boundary is the proof"
        className="mt-6"
      >
        apps/web holds no database credentials at all — the boundary isn&apos;t a
        limitation, it&apos;s the proof. A public surface that has no path to the
        raw governance store cannot leak it, by construction.
      </Callout>
    </div>
  );
}
