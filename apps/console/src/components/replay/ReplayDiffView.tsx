"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReplayResult } from "@adjudicate/admin-sdk";
import type { Decision } from "@adjudicate/core";
import { BasisFlatSet } from "@/components/decision/BasisFlatSet";
import { DecisionBadge } from "@/components/decision/DecisionBadge";
import { RefusalCard } from "@/components/decision/RefusalCard";
import { cn } from "@/lib/cn";

interface Props {
  result: ReplayResult;
}

/**
 * Side-by-side diff: Original (left, read-only) vs Recomputed (right,
 * highlighted on mismatch). Banner above states the classification:
 * reproduces / DECISION_KIND regression / BASIS_DRIFT / REFUSAL_CODE_DRIFT.
 *
 * Below the panes: a one-line caveat reminding operators that synthetic
 * state retrieval can't distinguish policy regression from state
 * divergence.
 */
export function ReplayDiffView({ result }: Props) {
  const { original, recomputed, classification, stateSource } = result;
  const isMatch = classification === null;

  return (
    <div className="flex flex-col gap-3">
      <ClassificationBanner classification={classification} />

      {/*
        SDK-schema-vs-core-Decision asymmetry: the tRPC payload's Decision
        has wider `basis.code: string` than core's per-category narrow
        `BasisCode<C>`. The framework intentionally accepts this looseness
        on the wire (see packages/admin-sdk/src/schemas/decision.ts) — the
        kernel only emits values from the BASIS_CODES vocabulary, so every
        on-the-wire record is structurally a valid core Decision; we just
        can't prove it generically. Same cast as `trpc-gateway.ts` uses.
      */}
      <div className="grid grid-cols-2 gap-3">
        <DecisionPane
          label="Original"
          decision={original.decision as Decision}
          highlight={false}
          delta={null}
        />
        <DecisionPane
          label="Recomputed"
          decision={recomputed as Decision}
          highlight={!isMatch}
          delta={classification?.basisDelta ?? null}
        />
      </div>

      {!isMatch ? (
        <p className="text-[10px] italic text-faint">
          Mismatch detected. Could indicate a policy regression OR a state
          divergence — {stateSource === "synthetic"
            ? "synthetic state retrieval is approximate"
            : "verify the adopter-supplied state matches decision-time state"}
          .
        </p>
      ) : null}
    </div>
  );
}

function ClassificationBanner({
  classification,
}: {
  classification: ReplayResult["classification"];
}) {
  if (classification === null) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-emerald-500/40 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-200">
        <CheckCircle2 size={14} className="text-emerald-300" />
        <span>
          <strong className="font-semibold">Reproduces.</strong> Decision
          matches under current policy + state.
        </span>
      </div>
    );
  }

  const TITLES: Record<
    typeof classification.kind,
    { title: string; severity: "high" | "medium" }
  > = {
    DECISION_KIND: {
      title: "Decision Kind Mismatch — Policy Regression",
      severity: "high",
    },
    BASIS_DRIFT: {
      title: "Basis Drift — Vocabulary Differences",
      severity: "medium",
    },
    REFUSAL_CODE_DRIFT: {
      title: "Refusal Code Drift — Taxonomy Evolution",
      severity: "medium",
    },
  };

  const { title, severity } = TITLES[classification.kind];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-[11px]",
        severity === "high"
          ? "border-red-500/60 bg-red-500/10 text-red-200"
          : "border-amber-500/40 bg-amber-500/5 text-amber-200",
      )}
    >
      <AlertTriangle
        size={14}
        className={severity === "high" ? "text-red-300" : "text-amber-300"}
      />
      <span>
        <strong className="font-semibold uppercase tracking-wider">
          {title}
        </strong>
      </span>
    </div>
  );
}

function DecisionPane({
  label,
  decision,
  highlight,
  delta,
}: {
  label: string;
  decision: Decision;
  highlight: boolean;
  delta: { missing: readonly string[]; extra: readonly string[] } | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-sm border bg-panel/40 p-3",
        highlight ? "border-red-500/40" : "border-edge",
      )}
    >
      <header className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-section text-faint">
          {label}
        </span>
        <DecisionBadge kind={decision.kind} />
      </header>

      {decision.kind === "REFUSE" ? (
        <RefusalCard refusal={decision.refusal} />
      ) : null}

      {decision.kind === "ESCALATE" ? (
        <div className="rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[11px]">
          <span className="text-faint">to: </span>
          <code className="text-ink">{decision.to}</code>
          <p className="mt-0.5 italic text-muted">{decision.reason}</p>
        </div>
      ) : null}

      {decision.kind === "DEFER" ? (
        <div className="rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[11px]">
          <span className="text-faint">signal: </span>
          <code className="text-ink">{decision.signal}</code>
          <p className="mt-0.5 text-muted">
            timeout: {(decision.timeoutMs / 1000).toFixed(0)}s
          </p>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-section text-faint">
          basis
        </div>
        <BasisFlatSet basis={decision.basis} />
        {delta && (delta.missing.length > 0 || delta.extra.length > 0) ? (
          <div className="mt-2 space-y-0.5 text-[10px]">
            {delta.missing.length > 0 ? (
              <div className="text-amber-300">
                <span className="text-faint">missing in recomputed: </span>
                {delta.missing.join(", ")}
              </div>
            ) : null}
            {delta.extra.length > 0 ? (
              <div className="text-amber-300">
                <span className="text-faint">extra in recomputed: </span>
                {delta.extra.join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
