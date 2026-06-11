"use client";

import {
  CircleCheck,
  Clock,
  HelpCircle,
  RotateCcw,
  ShieldX,
  UserCheck,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import type { DecisionKind } from "@adjudicate/core";
import { Section } from "@/components/ui/Section";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { HoverLift } from "@/components/motion/HoverLift";
import { DECISIONS } from "@/content/decisions";
import { cn } from "@/lib/cn";

/**
 * Step 2 — "What did the guard decide?" — the six-outcome BENTO.
 *
 * Client component (motion). Upgrades the old StepDecides chip grid into a
 * bento of varied tile sizes, one tile per outcome. Each tile carries:
 *   • the canonical DecisionChip (decision-coloured, icon + label),
 *   • a REAL one-line micro-example drawn from a shipped pack scenario
 *     (sourced from guided-cases.ts / pack scenarios, never invented), and
 *   • a <details> disclosure expanding "when is this chosen" so a reader can
 *     tell DEFER apart from ESCALATE, REWRITE apart from REFUSE, etc.
 *
 * REWRITE and DEFER are the headline tiles — the two that prove adjudicate
 * goes "beyond block-or-allow": a binary engine (OPA / Cedar) can only return
 * allow or deny, so it can neither correct an over-reach nor park an intent on
 * an external signal. Those two get the large, emphasised cells; the scenario
 * still resolves to REWRITE (the 100% → 25% clamp), carried through verbatim.
 *
 * Motion: the tiles cascade in via <Stagger> and lift on hover via
 * <HoverLift> — both useReducedMotion-gated (static, all-visible, no transform
 * under reduce-motion). The disclosure is a native <details>, so the
 * "when chosen" depth is reachable with zero motion. Transform/opacity-only.
 */

const RESOLVED: DecisionKind = "REWRITE";

const ICONS: Record<DecisionKind, LucideIcon> = {
  EXECUTE: CircleCheck,
  REFUSE: ShieldX,
  REWRITE: RotateCcw,
  DEFER: Clock,
  ESCALATE: UserCheck,
  REQUEST_CONFIRMATION: HelpCircle,
};

interface OutcomeTile {
  readonly kind: DecisionKind;
  /** REAL one-line micro-example from a shipped pack scenario. */
  readonly example: string;
  /** The pack the example is drawn from (attribution, not invention). */
  readonly fromPack: string;
  /** Plain-English "when is this chosen" — drawn out vs the neighbours. */
  readonly whenChosen: string;
  /** Headline tile (the "beyond block-or-allow" edge): larger cell. */
  readonly edge?: boolean;
  /** Short tag rendered on the edge tiles only. */
  readonly edgeTag?: string;
}

// Examples are lifted directly from guided-cases.ts (real, shipped pack
// scenarios that run the real kernel) — no fiction, no invented numbers.
const TILES: ReadonlyArray<OutcomeTile> = [
  {
    kind: "REWRITE",
    example:
      "A production deploy at 100% traffic is clamped to the 25% cap — corrected, not blocked.",
    fromPack: "Deployments · Approval",
    whenChosen:
      "Chosen when the intent is fixable, not fatal. The kernel substitutes a sanitised replacement envelope (here, rampPercent 100 → 25) so the action still completes — safely. A block-or-allow engine has no way to express this; it can only refuse the whole deploy.",
    edge: true,
    edgeTag: "beyond block-or-allow",
  },
  {
    kind: "DEFER",
    example:
      "A KYC session is parked until the verification vendor's callback actually arrives.",
    fromPack: "Identity · KYC",
    whenChosen:
      "Chosen when the decision can't be made yet — it depends on an external signal (a webhook, a queue message) or a timeout. The kernel parks the intent and resumes when the signal lands. Distinct from ESCALATE: DEFER waits on a system event, ESCALATE waits on a person.",
    edge: true,
    edgeTag: "beyond block-or-allow",
  },
  {
    kind: "ESCALATE",
    example:
      "A production deploy with no recorded human approval is routed to a person.",
    fromPack: "Deployments · Approval",
    whenChosen:
      "Chosen when a human must decide — the action is legitimate but requires accountable sign-off. The kernel hands it to an approver rather than ruling on its own. Distinct from REQUEST_CONFIRMATION, which asks the original caller; ESCALATE routes to someone else.",
  },
  {
    kind: "REQUEST_CONFIRMATION",
    example:
      "A pipe-to-shell command isn't auto-blocked — but a human must confirm before it runs.",
    fromPack: "Terminal · Command Risk",
    whenChosen:
      "Chosen when nothing is wrong, but the move is consequential enough to warrant an explicit yes from the caller. The kernel asks for an affirmative re-confirmation before proceeding — a deliberate speed-bump, not a refusal.",
  },
  {
    kind: "EXECUTE",
    example:
      "A small staging ramp at 25% clears every gate — the deploy runs as proposed.",
    fromPack: "Deployments · Approval",
    whenChosen:
      "Chosen when the intent clears every guard as-is. The kernel runs it against the side-effect and writes a signed receipt. The only outcome a binary engine shares — the other five are where adjudicate earns its place.",
  },
  {
    kind: "REFUSE",
    example: "An `rm -rf /` — irrecoverable destruction — is rejected outright.",
    fromPack: "Terminal · Command Risk",
    whenChosen:
      "Chosen when there is no safe way to proceed. The kernel returns a structured refusal carrying the basis for why — explainable, not a bare deny. Distinct from REWRITE: REFUSE means unfixable; REWRITE means corrected.",
  },
];

export function OutcomesBento() {
  return (
    <Section tone="surface" id="step-decides">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-muted">
          Step 2 / 4 · Guard decides
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Six outcomes, not two.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          A block-or-allow engine returns one bit: yes or no. adjudicate returns
          one of <span className="font-medium text-ink">six structured
          outcomes</span> — each carrying the basis for why. The two that matter
          most are the ones a binary engine{" "}
          <span className="font-medium text-ink">can&apos;t</span> express:{" "}
          <span className="font-medium text-rewrite-strong">REWRITE</span>{" "}
          corrects an over-reach instead of blocking it, and{" "}
          <span className="font-medium text-defer">DEFER</span> parks an intent
          until the real-world signal it&apos;s waiting on arrives.
        </p>
      </div>

      {/* Bento: REWRITE + DEFER are the wide "edge" tiles (top row, 2-up);
          the remaining four sit below in a tighter grid. Varied sizes, but
          transform/opacity-only motion — no layout shift on reveal/hover. */}
      <Stagger
        as="ul"
        className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2"
        aria-label="The six structured decisions the kernel can return"
      >
        {TILES.filter((t) => t.edge).map((tile) => (
          <BentoTile key={tile.kind} tile={tile} />
        ))}
      </Stagger>

      <Stagger
        as="ul"
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="The remaining structured decisions"
      >
        {TILES.filter((t) => !t.edge).map((tile) => (
          <BentoTile key={tile.kind} tile={tile} />
        ))}
      </Stagger>

      {/* This scenario's resolution — REWRITE: 100 → 25 (carried verbatim). */}
      <div className="mt-12 flex flex-col items-center gap-5">
        <div className="w-full max-w-2xl rounded-2xl border border-rewrite/50 bg-rewrite/5 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <DecisionChip kind={RESOLVED} size="md" />
            <span className="text-sm font-medium text-ink">
              Here, the guard rewrites the deploy.
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Production ramp above the policy cap is not refused outright —
            it&apos;s <span className="font-medium text-ink">clamped</span>. The
            kernel substitutes a sanitised replacement envelope before anything
            runs.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[13px]">
            <span className="rounded-md border border-edge bg-canvas px-3 py-1.5 text-muted">
              rampPercent:{" "}
              <span className="font-semibold text-ink line-through decoration-rewrite/60">
                100
              </span>
            </span>
            <span aria-hidden="true" className="text-faint">
              &rarr;
            </span>
            <span className="rounded-md border border-rewrite/60 bg-rewrite/10 px-3 py-1.5 font-semibold text-rewrite-strong">
              rampPercent: 25
            </span>
          </div>
        </div>

        <p className="max-w-md text-center text-sm text-muted">
          A decision is not enough. What did the kernel actually record?
        </p>

        <ArrowDown size={20} aria-hidden="true" className="text-faint" />
      </div>
    </Section>
  );
}

function BentoTile({ tile }: { readonly tile: OutcomeTile }) {
  const c = DECISIONS[tile.kind];
  const Icon = ICONS[tile.kind];
  const isResolved = tile.kind === RESOLVED;

  return (
    <StaggerItem as="li">
      <HoverLift
        className={cn(
          "h-full rounded-xl border bg-canvas",
          tile.edge
            ? "border-edge shadow-sm"
            : "border-edge",
          isResolved && "border-rewrite ring-1 ring-rewrite/40",
        )}
        glow={tile.edge}
        lift={tile.edge ? 6 : 4}
      >
        <details className="group h-full open:bg-canvas">
          <summary
            className={cn(
              "flex cursor-pointer list-none flex-col gap-3 rounded-xl p-5",
              "outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
              tile.edge && "p-6",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border font-medium uppercase tracking-section",
                  c.accent,
                  c.bg,
                  c.border,
                  tile.edge ? "gap-2 px-3 py-1.5 text-xs" : "gap-1.5 px-2.5 py-1 text-[11px]",
                )}
              >
                <Icon size={tile.edge ? 14 : 12} aria-hidden="true" />
                <span>{c.headline}</span>
              </span>
              {tile.edge && tile.edgeTag ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-section",
                    tile.kind === "REWRITE"
                      ? "border-rewrite/40 text-rewrite-strong"
                      : "border-defer/40 text-defer",
                  )}
                >
                  {tile.edgeTag}
                </span>
              ) : null}
            </div>

            <p
              className={cn(
                "leading-snug text-ink/90",
                tile.edge ? "text-[15px]" : "text-sm",
              )}
            >
              {tile.example}
            </p>

            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-section text-muted">
                {tile.fromPack}
              </span>
              <span className="text-xs font-medium text-muted transition-colors group-hover:text-ink group-open:text-ink">
                When is this chosen?
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition-transform group-open:rotate-180"
                >
                  &darr;
                </span>
              </span>
            </div>
          </summary>

          <div
            className={cn(
              "border-t border-edge px-5 pb-5 pt-4",
              tile.edge && "px-6 pb-6",
            )}
          >
            <p className="text-sm leading-relaxed text-muted">
              {tile.whenChosen}
            </p>
          </div>
        </details>
      </HoverLift>
    </StaggerItem>
  );
}
