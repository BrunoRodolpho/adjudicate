"use client";

import { useState } from "react";
import { ArrowUpCircle, ShieldAlert } from "lucide-react";
import type { EscalateRecommendation } from "@adjudicate/admin-sdk";
import { useRaiseEscalation } from "@/hooks/useRaiseEscalation";

/**
 * 114 — the Escalate / recommend surface of the write-isolated Adjudicant
 * (Inspector-General) OBSERVER plane.
 *
 * An operator raises a FRICTION-MONOTONE escalation/recommendation against an
 * audited decision (keyed by `intentHash`). This is the ONE write the observer
 * plane permits. The recommendation vocabulary is closed and friction-only —
 * pause / review / escalate — so the surface can NEVER authorize, weaken, lower
 * a threshold, override a refusal, or mint an EXECUTE. The output is a recorded
 * FACT, never a `Decision` (§C / §D inv.1, inv.2, inv.7).
 *
 * The friction-only constraint is enforced at THREE layers, defence-in-depth:
 * the UI radio set below, the wire schema (`EscalateRecommendationSchema`), and
 * the server-side enum on the mutation. There is no allow/bypass/override
 * control anywhere.
 */

interface RecommendationOption {
  readonly value: EscalateRecommendation;
  readonly label: string;
  readonly hint: string;
}

// Ordered by INCREASING friction. NONE of these decreases friction.
const RECOMMENDATIONS: readonly RecommendationOption[] = [
  {
    value: "review",
    label: "Recommend review",
    hint: "Flag for human review of this decision.",
  },
  {
    value: "escalate",
    label: "Recommend escalation",
    hint: "Escalate to a higher authority / incident process.",
  },
  {
    value: "pause",
    label: "Recommend pause / hold",
    hint: "Recommend a hold or freeze pending review (highest friction).",
  },
] as const;

export function EscalatePanel() {
  const [intentHash, setIntentHash] = useState("");
  const [recommendation, setRecommendation] =
    useState<EscalateRecommendation>("review");
  const [reason, setReason] = useState("");
  const escalate = useRaiseEscalation();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    escalate.reset();
    escalate.mutate({
      intentHash: intentHash.trim(),
      recommendation,
      reason: reason.trim(),
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex items-baseline justify-between border-b border-edge pb-3">
        <h1 className="text-[10px] uppercase tracking-section text-muted">
          Escalate · inspector-general
        </h1>
        <span className="text-[10px] text-faint">
          friction-monotone · escalate-only
        </span>
      </header>

      <p className="max-w-prose text-[11px] leading-relaxed text-muted">
        Raise an escalation or recommendation against an audited decision. This
        is the only write this plane permits, and it can only INCREASE friction —
        recommend pause, review, or escalation. It can never authorize, weaken,
        lower a threshold, override a refusal, or change a decision; the result
        is a recorded fact, not a decision.
      </p>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-sm border border-edge bg-panel/30 p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-section text-faint">
            Audited decision (intent hash)
          </span>
          <input
            data-testid="escalate-hash-input"
            aria-label="Intent hash of the audited decision"
            value={intentHash}
            onChange={(e) => setIntentHash(e.target.value)}
            placeholder="64-char sha256 intent hash"
            className="min-w-0 rounded-sm border border-edge bg-canvas px-2 py-1 font-mono text-[10px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="flex items-center gap-1.5 text-[10px] uppercase tracking-section text-faint">
            <ArrowUpCircle aria-hidden="true" className="h-3 w-3" />
            Recommendation (friction-only)
          </legend>
          {RECOMMENDATIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-start gap-2 rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[11px] text-muted hover:border-ink/30"
            >
              <input
                type="radio"
                name="recommendation"
                data-testid={`escalate-rec-${opt.value}`}
                value={opt.value}
                checked={recommendation === opt.value}
                onChange={() => setRecommendation(opt.value)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-ink">{opt.label}</span>
                <span className="text-[10px] text-faint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-section text-faint">
            Reason (10–500 chars)
          </span>
          <textarea
            data-testid="escalate-reason-input"
            aria-label="Reason for the escalation"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you escalating this decision?"
            className="min-w-0 rounded-sm border border-edge bg-canvas px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-ink/30 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          data-testid="escalate-submit"
          disabled={escalate.isPending}
          className="flex items-center justify-center gap-1.5 rounded-sm border border-edge bg-canvas px-3 py-1.5 text-[10px] uppercase tracking-section text-muted hover:border-ink/30 hover:text-ink focus:border-ink/30 focus:outline-none disabled:opacity-50"
        >
          <ShieldAlert aria-hidden="true" className="h-3 w-3" />
          {escalate.isPending ? "Raising…" : "Raise escalation"}
        </button>
      </form>

      {escalate.isError ? (
        <p
          data-testid="escalate-error"
          role="alert"
          className="rounded-sm border border-edge bg-panel/30 px-3 py-2 text-[11px] text-ink"
        >
          Failed to raise the escalation: {escalate.error.message}
        </p>
      ) : null}

      {escalate.isSuccess && escalate.data ? (
        <div
          data-testid="escalate-success"
          className="flex flex-col gap-1 rounded-sm border border-edge bg-panel/30 px-3 py-2 text-[11px] text-muted"
        >
          <span className="text-[10px] uppercase tracking-section text-faint">
            Escalation recorded (fact, not a decision)
          </span>
          <span>
            <span className="text-faint">recommendation:</span>{" "}
            <span className="text-ink">{escalate.data.recommendation}</span>
          </span>
          <span className="font-mono text-[10px] text-faint">
            id: {escalate.data.id}
          </span>
          <span className="font-mono text-[10px] text-faint">
            at: {escalate.data.at}
          </span>
        </div>
      ) : null}
    </div>
  );
}
