"use client";

import { ChevronDown, Loader2, Play } from "lucide-react";
import { useId, useState } from "react";
import type { DecisionKind } from "@adjudicate/core";
import type { GuidedStep as GuidedStepData } from "@/content/guided-cases";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { ConsoleHandoff } from "@/components/playground/ConsoleHandoff";
import { cn } from "@/lib/cn";
import { decisionSentence, guardFiredSentence } from "./guided-narration";

/**
 * One GUIDED step: a plain-language "The AI proposes…" line and a single
 * "Run this step" button. Pressing it POSTs the step's real
 * `{ intentKind, payload, state }` to the kernel and renders the live result
 * — which guard fired, the decision, and a collapsible signed receipt.
 *
 * Three visual states:
 *   - `collapsed`  — an earlier, already-run step shown as a one-line summary
 *                    chip (the runner collapses prior steps to keep focus).
 *   - `active`     — the current step: full framing + Run button + result.
 *   - run result   — once run, the active step shows its outcome inline.
 *
 * Accessibility: the result region is `aria-live="polite"`; the run control
 * and receipt toggle are real `<button>`s; the receipt uses a controlled
 * disclosure rather than CSS-only hiding so screen readers track its state.
 */

interface GuidedStepProps {
  readonly step: GuidedStepData;
  /** 1-based position for the "Step N" label. */
  readonly stepNumber: number;
  /**
   * Presentation mode. "collapsed" earlier steps render as a summary chip;
   * "active" renders the full interactive step.
   */
  readonly mode: "collapsed" | "active";
  /**
   * The result the runner is caching for this step (so collapsing/expanding
   * doesn't lose a run). When present, the step renders its result.
   */
  readonly result: PlaygroundResponse | null;
  /** Lift the run result up to the runner (drives StepStrip + collapse). */
  readonly onResult: (result: PlaygroundResponse) => void;
}

export function GuidedStep({
  step,
  stepNumber,
  mode,
  result,
  onResult,
}: GuidedStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptId = useId();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/playground/adjudicate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentKind: step.intentKind,
          payload: step.payload,
          state: step.state,
        }),
      });
      const data = (await res.json()) as
        | PlaygroundResponse
        | { error: string };
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Unexpected error.");
        return;
      }
      onResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  // ── Collapsed earlier step: a single summary line ────────────────────
  if (mode === "collapsed") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-edge bg-surface px-4 py-2.5">
        <StepBadge n={stepNumber} done={result !== null} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
          {step.aiProposes}
        </span>
        {result ? (
          <DecisionChip kind={result.decision.kind} size="sm" />
        ) : null}
      </div>
    );
  }

  // ── Active step ──────────────────────────────────────────────────────
  const actualKind: DecisionKind | null = result?.decision.kind ?? null;
  const mismatch =
    actualKind !== null && actualKind !== step.expectedKind;

  return (
    <div className="rounded-xl border border-edge bg-surface p-5">
      <div className="flex items-start gap-3">
        <StepBadge n={stepNumber} done={result !== null} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-section text-faint">
            The AI proposes
          </p>
          <p className="mt-1 text-[15px] font-medium leading-snug text-ink">
            {step.aiProposes}
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            {step.whatToWatch}
          </p>
        </div>
      </div>

      {/* Run control */}
      <div className="mt-4 flex flex-wrap items-center gap-3 pl-9">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-50",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {busy
            ? "Asking the kernel…"
            : result
              ? "Run this step again"
              : "Run this step"}
        </button>
        {result ? (
          <span className="text-[12px] text-faint">
            Ran against the real kernel.
          </span>
        ) : null}
      </div>

      {/* Result region — announced politely once the kernel answers. */}
      <div aria-live="polite" className="pl-9">
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-refuse/30 bg-refuse/10 px-3 py-2 text-[13px] text-refuse"
          >
            {error}
          </p>
        ) : null}

        {result && actualKind ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[12px] text-muted">
              {guardFiredSentence(result.trace)}
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <DecisionChip kind={actualKind} size="md" className="self-start" />
              <p className="text-[14px] leading-snug text-ink">
                {decisionSentence(step, actualKind)}
              </p>
            </div>

            {mismatch ? (
              <p className="rounded-lg border border-confirm/30 bg-confirm/10 px-3 py-2 text-[12px] text-confirm">
                Heads up: this story expected a{" "}
                <span className="font-medium uppercase tracking-section">
                  {step.expectedKind}
                </span>{" "}
                here, but the live kernel returned{" "}
                <span className="font-medium uppercase tracking-section">
                  {actualKind}
                </span>
                . The result above is the real one.
              </p>
            ) : null}

            {/* Collapsible receipt — controlled for SR-friendly state. */}
            <div>
              <button
                type="button"
                onClick={() => setShowReceipt((v) => !v)}
                aria-expanded={showReceipt}
                aria-controls={receiptId}
                className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-canvas px-3 py-1.5 text-[12px] font-medium text-ink transition hover:border-ink/30"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted transition-transform motion-reduce:transition-none",
                    showReceipt && "rotate-180",
                  )}
                  aria-hidden
                />
                {showReceipt
                  ? "Hide the receipt"
                  : "See the receipt the kernel saved"}
              </button>
              {showReceipt ? (
                <div id={receiptId} className="mt-3">
                  <ReceiptCard result={result} variant="compact" showTrace />
                </div>
              ) : null}
            </div>

            <ConsoleHandoff className="mt-1" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Small numbered badge; turns into a check tint once the step has run. */
function StepBadge({ n, done }: { readonly n: number; readonly done: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 flex-none items-center justify-center rounded-full font-mono text-[12px] font-medium",
        done
          ? "bg-execute/15 text-execute ring-1 ring-execute/30"
          : "bg-edge text-ink",
      )}
      aria-hidden
    >
      {n}
    </span>
  );
}
