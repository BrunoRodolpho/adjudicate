import { ArrowRight, Ban, Check } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Callout } from "@/components/ui/Callout";
import { Reveal } from "@/components/home/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { DECISIONS } from "@/content/decisions";
import { cn } from "@/lib/cn";

/**
 * ComparisonPreamble — the explanatory on-ramp for /comparisons (AUDIT P1).
 *
 * Before the decision grid and the wedge table, this section answers the
 * question a visitor who knows OPA/Cedar actually has: *why isn't allow/deny
 * enough for an AI workflow?* It grounds the abstract "six-outcome algebra"
 * claim in one concrete scenario (an agent wants to wire $10k; policy caps
 * transfers at $5k) and shows, side by side, what a binary permission engine
 * can do (allow the whole thing or block it) versus what the kernel can do
 * (rewrite it down to the cap, defer it, escalate it, ask for confirmation).
 *
 * The two outcome trees reuse the DECISIONS color tokens so the visual rhymes
 * with the grid below it. Server component for the copy; motion comes from the
 * reduced-motion-safe Reveal / Stagger wrappers, which degrade to static under
 * `prefers-reduced-motion`.
 */

/** One leaf in an outcome tree — a colored chip + its plain-English meaning. */
function OutcomeLeaf({
  label,
  dot,
  accent,
  meaning,
}: {
  readonly label: string;
  readonly dot: string;
  readonly accent: string;
  readonly meaning: string;
}) {
  return (
    <StaggerItem className="flex items-start gap-2.5">
      <span
        className={cn("mt-1 size-2 shrink-0 rounded-full", dot)}
        aria-hidden="true"
      />
      <p className="text-sm leading-snug text-muted">
        <span className={cn("font-semibold", accent)}>{label}</span>
        {" — "}
        {meaning}
      </p>
    </StaggerItem>
  );
}

export function ComparisonPreamble() {
  return (
    <Section tone="canvas" className="pt-12">
      <Reveal className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-section text-muted">
          Why allow/deny falls short
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          A permission engine answers one question. An AI workflow asks four
          more.
        </h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
          <p>
            OPA and Cedar are excellent at what they were built for: given a
            single proposed action, return <strong className="text-ink">yes</strong>{" "}
            or <strong className="text-ink">no</strong>. That model assumes the
            action is fixed and the only decision left is whether to let it
            through. It fits human-driven systems, where the request was already
            shaped by a person before it ever reached the policy layer.
          </p>
          <p>
            An AI agent breaks that assumption. The model proposes the action
            itself — and it can propose something almost right, something that
            should wait for an external signal, or something a human should sign
            off on first. A binary engine has nowhere to put those cases: it
            must either approve an action it shouldn&apos;t, or reject one it
            could have safely <em>adjusted</em>. The interesting decisions live
            in the gap between allow and deny.
          </p>
        </div>
      </Reveal>

      {/* Concrete scenario: a $10k transfer against a $5k cap. */}
      <Reveal className="mt-8">
        <Callout
          tone="info"
          title="Scenario: an agent wants to wire $10,000. Policy caps transfers at $5,000."
        >
          A yes/no engine has two moves — approve the full $10k (wrong) or block
          the transfer entirely (a dead end the agent can&apos;t recover from).
          Adjudicate has a third: <strong className="text-ink">REWRITE</strong>{" "}
          the intent down to the $5,000 cap and let it proceed — the kernel owns
          the corrected action, so the agent never executes the over-limit one.
          And if the right move is to wait for a settlement webhook, route to a
          treasury approver, or re-confirm with the caller, those are first-class
          outcomes too.
        </Callout>
      </Reveal>

      {/* Side-by-side: the binary tree vs the six-outcome tree. */}
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {/* Left — OPA / Cedar: two terminal leaves. */}
        <Reveal className="flex h-full flex-col rounded-2xl border border-edge bg-surface p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">OPA / Cedar</h3>
            <span className="rounded-full border border-edge bg-canvas px-2.5 py-0.5 text-[10px] uppercase tracking-section text-muted">
              2 outcomes
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            One proposed action in, a single verdict out. Both branches are
            terminal — there is no path that returns a <em>different</em> action.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-execute/40 bg-execute/10 px-3 py-2.5">
              <Check size={15} className="shrink-0 text-execute" aria-hidden="true" />
              <p className="text-sm text-muted">
                <span className="font-semibold text-execute">allow</span> — run
                the action exactly as proposed (the full $10k).
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-refuse/40 bg-refuse/10 px-3 py-2.5">
              <Ban size={15} className="shrink-0 text-refuse" aria-hidden="true" />
              <p className="text-sm text-muted">
                <span className="font-semibold text-refuse">deny</span> — block
                the action; the agent gets nothing back to act on.
              </p>
            </div>
          </div>
        </Reveal>

        {/* Right — adjudicate: six structured outcomes. */}
        <Reveal className="flex h-full flex-col rounded-2xl border border-edge bg-surface p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">adjudicate</h3>
            <span className="rounded-full border border-edge bg-canvas px-2.5 py-0.5 text-[10px] uppercase tracking-section text-muted">
              6 outcomes
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The same proposed action in — but the kernel can keep it, reshape it,
            park it, or route it onward. Four of these six have no expression in
            allow/deny at all.
          </p>
          <Stagger className="mt-5 flex flex-col gap-2.5" stagger={0.06}>
            <OutcomeLeaf
              label={DECISIONS.EXECUTE.kind}
              dot="bg-execute"
              accent="text-execute"
              meaning="run it as proposed (transfer is within cap)."
            />
            <OutcomeLeaf
              label={DECISIONS.REFUSE.kind}
              dot="bg-refuse"
              accent="text-refuse"
              meaning="reject it with a structured reason the agent can read."
            />
            <OutcomeLeaf
              label={DECISIONS.REWRITE.kind}
              dot="bg-rewrite"
              accent="text-rewrite"
              meaning="clamp the $10k down to the $5k cap; the kernel owns the corrected intent."
            />
            <OutcomeLeaf
              label={DECISIONS.DEFER.kind}
              dot="bg-defer"
              accent="text-defer"
              meaning="park it until a settlement webhook or queue signal arrives."
            />
            <OutcomeLeaf
              label={DECISIONS.ESCALATE.kind}
              dot="bg-escalate"
              accent="text-escalate"
              meaning="route it to a human approver before anything runs."
            />
            <OutcomeLeaf
              label={DECISIONS.REQUEST_CONFIRMATION.kind}
              dot="bg-confirm"
              accent="text-confirm"
              meaning="ask the caller to re-confirm before proceeding."
            />
          </Stagger>
        </Reveal>
      </div>

      {/* Anchored read-down to the detailed grid + wedge table. */}
      <Reveal className="mt-8">
        <p className="inline-flex items-center gap-1.5 text-sm text-muted">
          The full algebra and a feature-by-feature comparison follow below
          <ArrowRight size={14} aria-hidden="true" />
        </p>
      </Reveal>
    </Section>
  );
}
