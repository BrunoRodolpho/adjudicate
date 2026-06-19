import { Bot, ArrowDown } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";

/**
 * Step 1 — "What happened?"
 *
 * Server component. Anchors the whole spine in ONE concrete, alarming
 * scenario: an AI agent proposes shipping straight to 100% of production
 * traffic in one shot. The proposed action is rendered as the literal
 * IntentEnvelope the agent would submit — font-mono, dashed rewrite-orange
 * border — so the reader sees the raw input the kernel is about to judge.
 * (The kernel REWRITEs that 100% ramp down to the 25% production cap — the
 * decision the live Step-3 receipt records; see StepReceipt / decisions.ts.)
 *
 * No decision is shown here. This section only establishes the danger.
 */

const ENVELOPE_LINES: ReadonlyArray<{
  readonly key: string;
  readonly value: string;
  readonly danger?: boolean;
}> = [
  { key: "kind", value: '"deployment.approval.request"' },
  { key: "actor", value: '{ principal: "llm-agent", sessionId: "s-3f7a" }' },
  { key: "taint", value: '"UNTRUSTED"' },
  { key: "payload.service", value: '"api"' },
  { key: "payload.environment", value: '"production"', danger: true },
  { key: "payload.gitSha", value: '"feedface"' },
  { key: "payload.rampPercent", value: "100", danger: true },
];

export function StepActs() {
  return (
    <Section tone="canvas" id="step-acts">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p className="text-xs uppercase tracking-section text-muted">
          Step 1 / 4 · AI acts
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          An AI agent tries to ship to all of production.
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          A coding agent decides the change is safe and submits a deploy at{" "}
          <span className="font-medium text-ink">100% of production traffic</span>{" "}
          — far above the policy cap, in one shot. This is the action it wants to
          take, exactly as it reaches the kernel.
        </p>
      </div>

      <div className="mt-12 flex flex-col items-center gap-5">
        {/* Actor tag — who is acting. */}
        <div className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-muted shadow-sm">
          <Bot size={14} className="text-ink" aria-hidden="true" />
          <span className="font-medium text-ink">AI agent</span>
          <span className="text-muted">proposes</span>
        </div>

        {/* IntentEnvelope card — dashed rewrite-orange border, font-mono. */}
        <figure
          aria-label="Proposed intent envelope from the AI agent"
          className="w-full max-w-2xl overflow-hidden rounded-2xl border-2 border-dashed border-rewrite bg-rewrite/5 shadow-sm"
        >
          <figcaption className="flex items-center justify-between gap-3 border-b border-dashed border-rewrite/40 px-4 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-section text-rewrite-strong">
              PROPOSED · IntentEnvelope
            </span>
            <span className="font-mono text-[10px] uppercase tracking-section text-rewrite-strong/70">
              unjudged
            </span>
          </figcaption>
          <dl className="flex flex-col gap-1.5 px-5 py-4 font-mono text-[12px] leading-relaxed">
            {ENVELOPE_LINES.map((line) => (
              <div
                key={line.key}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <dt className="min-w-[180px] flex-none text-muted">
                  {line.key}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 break-words",
                    line.danger
                      ? "font-semibold text-rewrite-strong"
                      : "text-ink/85",
                  )}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </figure>

        <p className="max-w-md text-center text-sm text-muted">
          Nothing has run yet. Every AI action passes through the kernel first.
        </p>

        <ArrowDown
          size={20}
          aria-hidden="true"
          className="text-faint"
        />
      </div>
    </Section>
  );
}
