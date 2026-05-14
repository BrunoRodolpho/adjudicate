"use client";

import { useState } from "react";
import type { Decision } from "@adjudicate/core";
import { DecisionBadge } from "@/components/motion/DecisionBadge";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { useAuditLog } from "./audit-log-context";

export interface FlowStep {
  readonly title: string;
  readonly description: string;
  readonly intentKind: string;
  readonly payload: Record<string, unknown>;
  readonly state?: unknown;
  /** Expected outcome — for honesty messaging when the kernel disagrees. */
  readonly expectedKind: Decision["kind"];
}

/**
 * Generic step-runner used by PIX / KYC / Deployments simulators. Calls the
 * playground API for each step; renders the resulting Decision + basis.
 */
export function FlowSteps({
  steps,
  packName,
}: {
  steps: ReadonlyArray<FlowStep>;
  packName: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, Decision>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const { push } = useAuditLog();

  async function runStep(idx: number) {
    setActive(idx);
    setErrors((e) => ({ ...e, [idx]: "" }));
    try {
      const res = await fetch("/api/playground/adjudicate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intentKind: steps[idx]!.intentKind,
          payload: steps[idx]!.payload,
          state: steps[idx]!.state,
        }),
      });
      const data = (await res.json()) as {
        decision?: Decision;
        error?: string;
      };
      if (data.decision) {
        setResults((r) => ({ ...r, [idx]: data.decision! }));
        push({
          intentKind: steps[idx]!.intentKind,
          decision: data.decision,
          at: new Date().toISOString(),
          packName,
        });
      } else {
        setErrors((e) => ({ ...e, [idx]: data.error ?? "Unknown error" }));
      }
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [idx]: err instanceof Error ? err.message : "Network error",
      }));
    } finally {
      setActive(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs uppercase tracking-section text-faint">
        {packName} — run steps top to bottom
      </p>
      <ol className="flex flex-col gap-3">
        {steps.map((step, idx) => {
          const result = results[idx];
          const error = errors[idx];
          return (
            <li
              key={idx}
              className="rounded-lg border border-edge bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[11px] text-muted">
                      #{idx + 1}
                    </span>
                    <h4 className="font-semibold text-ink">{step.title}</h4>
                  </div>
                  <p className="mt-1 text-sm text-muted">{step.description}</p>
                  <code className="mt-2 inline-block rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink">
                    {step.intentKind}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => runStep(idx)}
                  disabled={active === idx}
                  className="rounded-full border border-edge bg-canvas px-3 py-1 text-xs font-medium text-ink hover:border-indigo-400 disabled:opacity-50"
                >
                  {active === idx ? "Running…" : "Run"}
                </button>
              </div>

              {result ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <DecisionBadge kind={result.kind} size="sm" />
                    {result.kind !== step.expectedKind ? (
                      <span className="text-[11px] text-defer">
                        (expected {step.expectedKind})
                      </span>
                    ) : null}
                  </div>
                  <CodeBlock
                    code={JSON.stringify(
                      result.basis.map((b) => `${b.category}:${b.code}`),
                      null,
                      2,
                    )}
                    className="text-[11px]"
                  />
                </div>
              ) : null}
              {error ? (
                <div className="mt-3 rounded-md border border-refuse/30 bg-refuse/10 px-3 py-2 text-sm text-refuse">
                  {error}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
