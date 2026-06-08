import type { DecisionKind } from "@adjudicate/core";
import { ArrowRight, Filter, RotateCcw, Power } from "lucide-react";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { DECISIONS } from "@/content/decisions";
import { runPlayground } from "@/lib/kernel-runner";
import { cn } from "@/lib/cn";

/**
 * Step 4 — "Where does the operator see it?"
 *
 * Server component, DARK band (Section tone="console"). The receipt from
 * Step 3 lands in the operator's Audit Explorer as one decision-coloured row
 * among the live tail. Operators read every receipt, filter, replay, and pull
 * the kill switch. CTA hands off to the real console.
 *
 * The highlighted REWRITE row carries the REAL intentHash from the same
 * deterministic kernel run that produced the Step-3 receipt.
 */

interface Row {
  readonly kind: DecisionKind;
  readonly intent: string;
  readonly hash: string;
  readonly highlight?: boolean;
}

// Dark-surface decision tokens. The DECISIONS palette tokens are tuned for the
// light canvas; on zinc-950 we lift the chip to a translucent tint + the
// decision hue so each outcome stays unmistakable against the dark band.
const DARK_CHIP: Record<DecisionKind, string> = {
  EXECUTE: "border-execute/40 bg-execute/15 text-execute",
  REFUSE: "border-refuse/40 bg-refuse/15 text-refuse",
  REWRITE: "border-rewrite/50 bg-rewrite/15 text-rewrite",
  DEFER: "border-defer/40 bg-defer/15 text-defer",
  ESCALATE: "border-escalate/40 bg-escalate/15 text-escalate",
  REQUEST_CONFIRMATION: "border-confirm/40 bg-confirm/15 text-confirm",
};

const DARK_BAR: Record<DecisionKind, string> = {
  EXECUTE: "bg-execute",
  REFUSE: "bg-refuse",
  REWRITE: "bg-rewrite",
  DEFER: "bg-defer",
  ESCALATE: "bg-escalate",
  REQUEST_CONFIRMATION: "bg-confirm",
};

const SHORT_LABEL: Record<DecisionKind, string> = {
  EXECUTE: "EXECUTE",
  REFUSE: "REFUSE",
  REWRITE: "REWRITE",
  DEFER: "DEFER",
  ESCALATE: "ESCALATE",
  REQUEST_CONFIRMATION: "CONFIRM?",
};

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 10);
}

async function buildRows(): Promise<ReadonlyArray<Row>> {
  // Real hash for the highlighted row — same deterministic run as Step 3.
  let scenarioHash = "3f7a8c10ab";
  try {
    const preset = DECISIONS.REWRITE.playgroundPreset;
    const res = await runPlayground({
      intentKind: preset.intentKind,
      payload: preset.payload,
    });
    scenarioHash = shortHash(res.record.intentHash);
  } catch {
    /* keep the representative hash */
  }

  return [
    { kind: "EXECUTE", intent: "pix.charge.refund", hash: "ae12c8917b" },
    { kind: "DEFER", intent: "kyc.session.start", hash: "44b9ef0231" },
    {
      kind: "REWRITE",
      intent: "deployment.approval.request",
      hash: scenarioHash,
      highlight: true,
    },
    { kind: "ESCALATE", intent: "deployment.approval.request", hash: "91e2dd6bc4" },
    { kind: "REFUSE", intent: "pix.charge.refund", hash: "cd03ab8f10" },
    { kind: "REQUEST_CONFIRMATION", intent: "deployment.rollback.execute", hash: "2a18ff4d09" },
  ];
}

export async function StepConsole() {
  const rows = await buildRows();

  return (
    <Section tone="console" id="step-console">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-zinc-500">
          Step 4 / 4 · Console displays
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
          Operators read every receipt.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          The receipt lands in the Audit Explorer the moment it&apos;s written.
          Operators filter by outcome, replay any decision, and pull the kill
          switch if anything looks wrong.
        </p>
      </div>

      {/* Audit Explorer replica — the REWRITE receipt as one row in the tail. */}
      <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-3 font-mono text-[10px] uppercase tracking-section text-zinc-500">
            audit explorer · live tail
          </span>
        </div>

        {/* Column header. */}
        <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-800 px-4 py-2 font-mono text-[10px] uppercase tracking-section text-zinc-600">
          <span>decision</span>
          <span>intent</span>
          <span>intentHash</span>
        </div>

        <ul className="divide-y divide-zinc-800/70">
          {rows.map((row, i) => (
            <li
              key={`${row.hash}-${i}`}
              className={cn(
                "relative grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors",
                row.highlight ? "bg-rewrite/[0.07]" : "hover:bg-zinc-800/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 w-0.5",
                  row.highlight ? DARK_BAR[row.kind] : "bg-transparent",
                )}
              />
              <span
                className={cn(
                  "inline-flex w-fit items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-section",
                  DARK_CHIP[row.kind],
                )}
              >
                {SHORT_LABEL[row.kind]}
              </span>
              <span className="min-w-0 truncate font-mono text-[12px] text-zinc-300">
                {row.intent}
              </span>
              <span className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                {shortHashDisplay(row.hash)}
                {row.highlight ? (
                  <span className="rounded-sm bg-rewrite/20 px-1.5 py-0.5 text-[9px] uppercase tracking-section text-rewrite">
                    your receipt
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Operator capability chips. */}
      <div className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-center gap-3">
        <Capability icon={<Filter size={14} aria-hidden="true" />}>
          Filter by outcome
        </Capability>
        <Capability icon={<RotateCcw size={14} aria-hidden="true" />}>
          Replay any decision
        </Capability>
        <Capability icon={<Power size={14} aria-hidden="true" />}>
          Pull the kill switch
        </Capability>
      </div>

      <div className="mt-10 flex justify-center">
        <Button href="/console" variant="primary">
          Open the console <ArrowRight size={16} />
        </Button>
      </div>
    </Section>
  );
}

function shortHashDisplay(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

function Capability({
  icon,
  children,
}: {
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300">
      <span className="text-zinc-500">{icon}</span>
      {children}
    </span>
  );
}
