"use client";

import {
  Banknote,
  Gauge,
  Rocket,
  ShieldCheck,
  Terminal,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { DecisionKind } from "@adjudicate/core";
import { GUIDED_CASES, type GuidedCase } from "@/content/guided-cases";
import { DECISIONS } from "@/content/decisions";
import { cn } from "@/lib/cn";

/**
 * The GUIDED landing grid: six inviting business-scenario cards (one per
 * installed Pack), NOT preset chips. Each card carries a domain icon, a
 * plain-English title, the one-line setup, and small decision dots showing
 * which outcomes the story walks through. Calm, roomy, max 3 columns.
 *
 * Presentational client component — interactivity is just the `onPick`
 * callback the orchestrator passes down.
 */

// Icon-name string in content → lucide component. Kept local so the content
// module stays free of React imports.
const ICONS: Record<string, LucideIcon> = {
  Banknote,
  UserCheck,
  Rocket,
  ShieldCheck,
  Gauge,
  Terminal,
};

/**
 * Unique decision kinds a case showcases, in first-appearance order. Drives
 * the row of decision dots so the reader can see the variety up front.
 */
function caseOutcomes(c: GuidedCase): ReadonlyArray<DecisionKind> {
  const seen = new Set<DecisionKind>();
  const out: DecisionKind[] = [];
  for (const step of c.steps) {
    if (!seen.has(step.expectedKind)) {
      seen.add(step.expectedKind);
      out.push(step.expectedKind);
    }
  }
  return out;
}

export function GuidedCasePicker({
  onPick,
}: {
  readonly onPick: (caseId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-[14px] leading-relaxed text-console-muted">
          Pick a real business situation from an installed Pack. Each one is a
          short story you run a step at a time — the AI proposes an action, and
          you watch the real kernel decide. No JSON, no setup; best for a first
          look. Jump to the sandbox when you&apos;re ready to configure your own.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDED_CASES.map((c) => (
          <li key={c.id}>
            <GuidedCaseCard guidedCase={c} onPick={onPick} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuidedCaseCard({
  guidedCase,
  onPick,
}: {
  readonly guidedCase: GuidedCase;
  readonly onPick: (caseId: string) => void;
}) {
  const Icon = ICONS[guidedCase.icon] ?? ShieldCheck;
  const outcomes = caseOutcomes(guidedCase);
  const summary = guidedCase.steps[0]?.aiProposes ?? "";

  return (
    <button
      type="button"
      onClick={() => onPick(guidedCase.id)}
      className={cn(
        "group flex h-full w-full flex-col gap-4 rounded-2xl border border-console-edge bg-console-panel p-5 text-left transition",
        "hover:border-console-ink/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 flex-none items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-[16px] font-semibold leading-tight text-console-ink">
          {guidedCase.title}
        </h3>
      </div>

      <p className="flex-1 text-[13px] leading-snug text-console-muted">{summary}</p>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-medium uppercase tracking-section text-console-muted">
          Outcomes you&apos;ll see
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {outcomes.map((kind) => (
            <OutcomeDot key={kind} kind={kind} />
          ))}
        </div>
      </div>
    </button>
  );
}

/**
 * A compact decision dot — coloured pill + label, smaller than DecisionChip,
 * used to preview the outcomes a story covers without the full icon chrome.
 */
function OutcomeDot({ kind }: { readonly kind: DecisionKind }) {
  const c = DECISIONS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-section",
        c.accent,
        c.bg,
        c.border,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", c.accent.replace("text-", "bg-"))}
        aria-hidden
      />
      {c.headline}
    </span>
  );
}
