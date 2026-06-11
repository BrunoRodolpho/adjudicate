import type { Decision, DecisionBasis } from "@adjudicate/core";
import { runPlayground } from "@/lib/kernel-runner";
import type { Recipe } from "@/content/recipes";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Callout } from "@/components/ui/Callout";

/**
 * WorkedOutcome — the "what the kernel actually does" beat of a recipe page.
 *
 * SERVER component. Two paths:
 *
 *   • recipe.live (non-null) — runs the REAL kernel server-side at render time
 *     via `runPlayground(recipe.live)` and renders the genuine decision:
 *       - refund / pii / token / deploy / defer → a full <ReceiptCard> (the
 *         real REWRITE diff, REFUSE, clamp or DEFER signal the kernel made).
 *       - command-risk (block-dangerous-commands) → a FOCUSED, command-free
 *         summary (DecisionChip + risk CATEGORY + basis codes ONLY). The
 *         ReceiptCard is deliberately NOT used here: it would echo the
 *         envelope payload, the REQUEST_CONFIRMATION prompt, and the basis
 *         `detail` object — all of which carry the command string (ADR-123).
 *
 *   • recipe.live === null — the pack is NOT installed in the web kernel-runner
 *     (least-privilege-access, cap-blast-radius). We render an illustrative
 *     outcome card: the described DecisionChip + a one-line "what the kernel
 *     returns" + a visible "illustrative — this pack isn't in the web
 *     playground" Callout. No fake live data.
 */

const COMMAND_RISK_SLUG = "block-dangerous-commands";

export async function WorkedOutcome({ recipe }: { readonly recipe: Recipe }) {
  if (recipe.live === null) {
    return <IllustrativeOutcome recipe={recipe} />;
  }

  const result = await runPlayground({
    intentKind: recipe.live.intentKind,
    payload: recipe.live.payload,
    state: recipe.live.state,
  });

  // INVARIANT: command-risk reports by category + basis only, never the
  // command. Do NOT route it through ReceiptCard.
  if (recipe.slug === COMMAND_RISK_SLUG) {
    return <CommandRiskSummary decision={result.decision} />;
  }

  // refund / pii / token / deploy / defer — the full receipt is safe and is
  // the point: it shows the real REWRITE diff / REFUSE / clamp / DEFER.
  return (
    <div className="flex flex-col gap-3">
      <RealKernelLabel />
      <ReceiptCard result={result} variant="full" />
    </div>
  );
}

/* ── live: command-risk (command-free) ─────────────────────────────────── */

/**
 * CommandRiskSummary — the ONLY rendering of a command-risk decision on a
 * recipe page. Shows the DECISION, the closed-enum risk CATEGORY (destructive
 * / network / credential), and the BASIS CODES — never the command string,
 * never the basis `detail` (it embeds the command), never the
 * REQUEST_CONFIRMATION prompt (it interpolates the command).
 */
function CommandRiskSummary({ decision }: { readonly decision: Decision }) {
  const riskCategory = extractRiskCategory(decision.basis);
  // category:code pairs are safe vocabulary; every basis `detail` is dropped.
  const codes = decision.basis.map((b) => `${b.category}:${b.code}`);

  return (
    <div className="flex flex-col gap-3">
      <RealKernelLabel />
      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <DecisionChip kind={decision.kind} size="md" />
          <span className="font-mono text-[10px] uppercase tracking-section text-muted">
            command-risk · summary
          </span>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-section text-muted">
              risk category:
            </span>
            <span className="rounded-md border border-escalate/30 bg-escalate/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-section text-escalate">
              {riskCategory ?? "unclassified"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-section text-muted">
              basis · {codes.length}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <li key={code}>
                  <code className="rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink/85">
                    {code}
                  </code>
                </li>
              ))}
            </ul>
          </div>

          <Callout tone="warn" title="Command text is never rendered">
            By policy (ADR-123) the raw command, the basis detail, and the
            confirmation prompt are withheld from every surface. The kernel
            still made a real, audited decision — this outcome is reported by{" "}
            <span className="text-ink">category</span> and{" "}
            <span className="text-ink">basis</span> alone.
          </Callout>
        </div>
      </div>
    </div>
  );
}

/**
 * Read the closed-enum risk category off the basis `detail.category` without
 * surfacing any other detail field. Returns null if absent (e.g. a safe path).
 */
function extractRiskCategory(
  basis: ReadonlyArray<DecisionBasis>,
): string | null {
  for (const b of basis) {
    const detail = "detail" in b ? (b.detail as unknown) : undefined;
    if (detail && typeof detail === "object" && "category" in detail) {
      const c = (detail as { category?: unknown }).category;
      if (typeof c === "string") return c;
    }
  }
  return null;
}

/* ── illustrative (pack not installed in the web kernel-runner) ─────────── */

/**
 * Described outcome for a recipe whose pack is NOT installed in the web
 * kernel-runner. We do NOT call the kernel (it would throw — no Pack handles
 * the intent kind). Instead: the DecisionChip the pack's policy produces, a
 * one-line "what the kernel returns", and a visible illustrative Callout.
 */
function IllustrativeOutcome({ recipe }: { readonly recipe: Recipe }) {
  return (
    <div className="flex flex-col gap-3">
      <IllustrativeLabel />
      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <DecisionChip kind={recipe.outcome} size="md" />
          <span className="font-mono text-[10px] uppercase tracking-section text-muted">
            described outcome
          </span>
        </header>
        <div className="flex flex-col gap-4 px-4 py-4">
          <p className="text-sm leading-relaxed text-muted">
            {whatTheKernelReturns(recipe)}
          </p>
          <Callout tone="info" title="Illustrative — not a live run">
            The <code className="font-mono text-ink/85">{recipe.guardOrPack.npmPackage}</code>{" "}
            pack isn&apos;t installed in the web playground, so this outcome is
            described from the pack&apos;s policy rather than run through the
            kernel here. Install the pack in your own kernel and the same guard
            produces this decision against real state.
          </Callout>
        </div>
      </div>
    </div>
  );
}

function whatTheKernelReturns(recipe: Recipe): string {
  switch (recipe.outcome) {
    case "REWRITE":
      return "The kernel returns a REWRITE: a sanitised replacement intent with the over-broad field clamped down, taint and provenance preserved, so the action proceeds against the safe value.";
    case "ESCALATE":
      return "The kernel returns an ESCALATE: the intent is routed to a human supervisor and no side effect runs until a human clears it.";
    case "REFUSE":
      return "The kernel returns a REFUSE: a structured refusal with a code and a basis — the action is rejected before any side effect.";
    case "DEFER":
      return "The kernel returns a DEFER: the intent is parked on an external signal and resumes — the same intent — when that signal fires.";
    case "REQUEST_CONFIRMATION":
      return "The kernel returns a REQUEST_CONFIRMATION: it asks for an affirmative re-confirmation before the action proceeds.";
    case "EXECUTE":
      return "The kernel returns an EXECUTE: the in-bounds intent runs against the side effect.";
  }
}

/* ── shared labels ─────────────────────────────────────────────────────── */

function RealKernelLabel() {
  return (
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-section text-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-execute" />
      Real kernel · run server-side at render time
    </p>
  );
}

function IllustrativeLabel() {
  return (
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-section text-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-defer" />
      <span className="rounded-sm border border-defer/40 bg-defer/10 px-1.5 py-0.5 text-defer">
        Illustrative
      </span>
      <span className="normal-case tracking-normal text-muted">
        this pack isn&apos;t in the web playground
      </span>
    </p>
  );
}
