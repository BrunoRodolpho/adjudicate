"use client";

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import type { GuidedCase } from "@/content/guided-cases";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import { StepStrip } from "@/components/ui/StepStrip";
import { cn } from "@/lib/cn";
import { GuidedStep } from "./GuidedStep";

/**
 * Runs a single GUIDED case: the story blurb, the four-step "AI acts →
 * Guard decides → Receipt saved → Console shows" spine, and the vertical
 * list of steps the reader works top-to-bottom.
 *
 * Focus management: only one step is `active` at a time. Earlier steps
 * collapse to a one-line summary chip; later steps stay collapsed until the
 * reader advances. The StepStrip phase is driven by how far the active step
 * has progressed — idle on phase 1 ("AI acts") and, once the active step has
 * a result, phase 3 ("Receipt saved").
 *
 * The per-step results are cached here (keyed by step id) so collapsing and
 * re-expanding never loses a run, and so advancing is gated on a real result.
 */

export function GuidedCaseRunner({
  guidedCase,
  onBack,
}: {
  readonly guidedCase: GuidedCase;
  readonly onBack: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<
    Record<string, PlaygroundResponse>
  >({});
  const [running, setRunning] = useState(false);

  const steps = guidedCase.steps;
  const activeStep = steps[activeIndex];
  const activeResult = activeStep ? results[activeStep.id] ?? null : null;

  // StepStrip phase tracks the active step through the spine as it runs:
  //   idle, no result   → 1 "AI acts" (the AI's proposal is on screen)
  //   in flight          → 2 "Guard decides" (kernel computing; chip pulses)
  //   result in hand     → 3 "Receipt saved" (a tamper-evident receipt now exists)
  const stripPhase = running ? 2 : activeResult ? 3 : 1;

  const isLastStep = activeIndex === steps.length - 1;

  function recordResult(stepId: string, result: PlaygroundResponse) {
    setResults((prev) => ({ ...prev, [stepId]: result }));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to all scenarios
      </button>

      {/* Story header */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-ink">{guidedCase.title}</h3>
        <p className="max-w-2xl text-[14px] leading-relaxed text-muted">
          {guidedCase.blurb}
        </p>
      </div>

      {/* The story spine */}
      <div className="rounded-xl border border-edge bg-canvas/60 px-4 py-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-section text-muted">
          What happens on every run
        </p>
        <StepStrip active={stripPhase} pulse={running} />
      </div>

      {/* Steps */}
      <ol className="flex flex-col gap-3">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex;
          const isPast = idx < activeIndex;
          // Future steps stay hidden until reached, keeping focus tight.
          if (idx > activeIndex) return null;
          return (
            <li key={step.id}>
              <GuidedStep
                step={step}
                stepNumber={idx + 1}
                mode={isPast ? "collapsed" : "active"}
                result={results[step.id] ?? null}
                onResult={(r) => recordResult(step.id, r)}
                onBusyChange={isActive ? setRunning : undefined}
                isLastStep={isLastStep}
              />
              {/* Advance control: only on the active step, once it has run. */}
              {isActive && activeResult && !isLastStep ? (
                <div className="mt-3 pl-9">
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => i + 1)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-edge bg-canvas px-4 py-2 text-[13px] font-medium text-ink transition hover:border-ink/30",
                    )}
                  >
                    Next step →
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* End-of-story note */}
      {isLastStep && activeResult ? (
        <div className="rounded-xl border border-edge bg-canvas/60 px-4 py-3 text-[13px] text-muted">
          That&apos;s the whole story. Every step above ran the real kernel and
          produced a tamper-evident receipt — pick{" "}
          <button
            type="button"
            onClick={onBack}
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            another scenario
          </button>{" "}
          to see a different set of outcomes.
        </div>
      ) : null}
    </div>
  );
}
