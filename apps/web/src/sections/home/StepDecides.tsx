import { ArrowDown } from "lucide-react";
import type { DecisionKind } from "@adjudicate/core";
import { Section } from "@/components/ui/Section";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { DECISIONS, DECISIONS_ORDER } from "@/content/decisions";
import { cn } from "@/lib/cn";

/**
 * Step 2 — "What did the guard decide?"
 *
 * Server component. The kernel returns exactly ONE of six structured
 * decisions — never a free-form allow/deny. The six are rendered as a
 * load-bearing DecisionChip grid (canonical order + one-liners), so the
 * reader sees the whole closed set at once.
 *
 * For THIS scenario the kernel resolves to REWRITE: it clamps the
 * production ramp from 100% down to the policy cap of 25% and substitutes a
 * sanitised replacement envelope before anything runs. REWRITE is
 * highlighted, but all six are first-class members of the algebra.
 */

const RESOLVED: DecisionKind = "REWRITE";

export function StepDecides() {
  return (
    <Section tone="surface" id="step-decides">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-muted">
          Step 2 / 4 · Guard decides
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          The kernel returns one of six decisions.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          Not allow or deny. A guard evaluates the envelope and the kernel
          disposes with exactly one structured outcome from a closed set —
          each carrying the basis for why.
        </p>
      </div>

      <div
        role="list"
        aria-label="The six structured decisions the kernel can return"
        className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {DECISIONS_ORDER.map((kind) => {
          const c = DECISIONS[kind];
          const isResolved = kind === RESOLVED;
          return (
            <div
              key={kind}
              role="listitem"
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-canvas p-5 transition",
                isResolved
                  ? "border-rewrite ring-1 ring-rewrite/40 shadow-sm"
                  : "border-edge",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <DecisionChip kind={kind} size="md" />
                {isResolved ? (
                  <span className="font-mono text-[9px] uppercase tracking-section text-rewrite-strong">
                    this scenario
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-snug text-muted">{c.oneLiner}</p>
            </div>
          );
        })}
      </div>

      {/* This scenario's resolution — REWRITE: 100 → 25. */}
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
