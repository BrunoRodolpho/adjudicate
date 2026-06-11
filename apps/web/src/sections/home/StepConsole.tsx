import { ArrowRight, Filter, RotateCcw, Power } from "lucide-react";
import type { ReactNode } from "react";
import { ConsoleAuditRows, type AuditRow } from "./ConsoleAuditRows";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { DECISIONS } from "@/content/decisions";
import { runPlayground } from "@/lib/kernel-runner";

/**
 * Step 4 — "Where does the operator see it?" — the black box, read back.
 *
 * Async server component, DARK band (Section tone="console"). The receipt from
 * Step 3 lands in the operator's Audit Explorer as one decision-coloured row
 * among the live tail. Operators read every receipt, filter, replay, and pull
 * the kill switch. CTA hands off to the real console (and /architecture/data-flow).
 *
 * The highlighted REWRITE row carries the REAL intentHash from the same
 * deterministic kernel run that produced the Step-3 receipt — closing the
 * "black box recorder" loop: the signed receipt you just saw, read back here.
 *
 * The rows animate in (staggered translateX + opacity, REWRITE row gently
 * pulsed) inside the client <ConsoleAuditRows>; everything else stays a server
 * component. Reduced-motion renders the rows static.
 */

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 10);
}

async function buildRows(): Promise<ReadonlyArray<AuditRow>> {
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
          The black box, read back. The signed receipt from Step 3 lands in the
          Audit Explorer the moment it&apos;s written — same intentHash, now one
          row in the live tail. Operators filter by outcome, replay any
          decision, and pull the kill switch if anything looks wrong.
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

        <ConsoleAuditRows rows={rows} />
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

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Button href="/console" variant="primary">
          Open the console <ArrowRight size={16} />
        </Button>
        <a
          href="/architecture/data-flow"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
        >
          See how a receipt is recorded &amp; replayed
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </Section>
  );
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
