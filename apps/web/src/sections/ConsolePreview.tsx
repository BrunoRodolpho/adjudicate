import { ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/cn";

/**
 * Dark band advertising the operator console (apps/console at port 5180).
 * Switches to the console's zinc-950 aesthetic so the visual transition
 * signals "you've moved from marketing to operator surface."
 *
 * Motion (AUDIT P2): the mock audit-explorer rows fade + rise in a
 * reduced-motion-safe `Stagger` as the band scrolls into view, so the tail
 * reads as if it's filling in. The newest row carries a subtle motion-safe
 * pulse on its badge to suggest a live feed. Transform/opacity-only; under
 * `prefers-reduced-motion` the rows render statically and the pulse is dropped.
 */
export function ConsolePreview() {
  return (
    <section className="bg-zinc-950 py-20 text-zinc-100">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] uppercase tracking-section text-zinc-400">
            <Terminal size={12} /> Operator console
          </span>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            When the LLM proposes,{" "}
            <span className="bg-gradient-flow bg-clip-text text-transparent">
              your operators dispose.
            </span>
          </h2>
          <p className="max-w-xl text-zinc-400">
            Audit Explorer, kill switch, replay, outcome-distribution
            dashboard, guard-metrics visualiser. Everything an operator needs
            to read the governance trail and pull the plug if anything looks
            wrong.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="http://localhost:5180"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-flow px-5 py-2.5 text-sm font-medium text-zinc-950 hover:brightness-110"
            >
              Open the console <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Mock screenshot — a stylised representation of the Audit Explorer. */}
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl">
          <div className="mb-3 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-3 text-[10px] uppercase tracking-section text-zinc-500">
              audit-explorer · localhost:5180
            </span>
          </div>
          <div className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400">
            <div className="mb-2 flex items-center gap-2 text-zinc-500">
              <span>{`>`}</span>
              <span className="text-zinc-300">audit.query</span>
              <span>{`{ since: "now-24h", decisionKind: undefined }`}</span>
            </div>
            <Stagger className="space-y-1" stagger={0.06}>
              <Row badge="execute" kind="EXECUTE" intent="pix.charge.refund" hash="ae12c891" live />
              <Row badge="defer" kind="DEFER" intent="kyc.start" hash="44b9ef02" />
              <Row badge="rewrite" kind="REWRITE" intent="deployment.approval.request" hash="3f7a8c10" />
              <Row badge="escalate" kind="ESCALATE" intent="deployment.approval.request" hash="91e2dd6b" />
              <Row badge="refuse" kind="REFUSE" intent="pix.charge.refund" hash="cd03ab8f" />
              <Row badge="confirm" kind="CONFIRM?" intent="deployment.rollback.execute" hash="2a18ff4d" />
            </Stagger>
          </div>
        </div>
      </div>
    </section>
  );
}

const BADGE_CLASS: Record<string, string> = {
  execute: "bg-emerald-500/15 text-emerald-300",
  defer: "bg-amber-500/15 text-amber-300",
  rewrite: "bg-orange-500/15 text-orange-300",
  escalate: "bg-violet-500/15 text-violet-300",
  refuse: "bg-rose-500/15 text-rose-300",
  confirm: "bg-sky-500/15 text-sky-300",
};

function Row({
  badge,
  kind,
  intent,
  hash,
  live = false,
}: {
  badge: string;
  kind: string;
  intent: string;
  hash: string;
  /** Marks the newest row — its badge gets a subtle motion-safe pulse. */
  live?: boolean;
}) {
  return (
    <StaggerItem className="flex items-center gap-3">
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-section",
          BADGE_CLASS[badge],
          live && "motion-safe:animate-pulse",
        )}
      >
        {kind}
      </span>
      <span className="text-zinc-300">{intent}</span>
      <span className="ml-auto text-zinc-600">{hash}</span>
    </StaggerItem>
  );
}
