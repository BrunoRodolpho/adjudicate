"use client";

import { useEffect, useState } from "react";
import { ChevronDown, UserCheck, Users } from "lucide-react";
import type {
  AdjudicationTraceEntry,
  AuditRecord,
  Decision,
  DecisionBasis,
  IntentEnvelope,
} from "@adjudicate/core";
import type { JsonSegment } from "@/lib/json-segment";
import type { PlaygroundResponse } from "@/lib/kernel-runner";
import {
  auditToSegments,
  envelopeToSegments,
  humaniseTimeoutMs,
  payloadDiffSegments,
  truncMiddle,
} from "@/lib/worked-example-segments";
import { DecisionBadge } from "@/components/motion/DecisionBadge";
import { cn } from "@/lib/cn";

/**
 * WorkedExamplePanel — the deep view of a single kernel run. Shows the
 * mechanism the hero animation teases: envelope-in → (optional pre-state)
 * → guard pipeline → full decision payload → audit record.
 *
 * Renders the same depth across all six outcomes. REWRITE is the lead
 * (side-by-side payload diff + cross-hash chips); other outcomes get
 * outcome-shaped bodies (refusal, prompt, signal+timeout, etc.).
 */

interface Props {
  readonly result: PlaygroundResponse;
  /** Optional state passed into the run (FlowSteps only). */
  readonly initialState?: unknown;
  /** When true, body is collapsed behind the header strip until clicked. */
  readonly compact?: boolean;
}

const OUTCOME_TEXT_CLASS: Record<Decision["kind"], string> = {
  EXECUTE: "text-execute",
  REFUSE: "text-refuse",
  REWRITE: "text-rewrite-strong",
  DEFER: "text-defer",
  ESCALATE: "text-escalate",
  REQUEST_CONFIRMATION: "text-confirm",
};

const OUTCOME_BORDER_CLASS: Record<Decision["kind"], string> = {
  EXECUTE: "border-execute",
  REFUSE: "border-refuse",
  REWRITE: "border-rewrite",
  DEFER: "border-defer",
  ESCALATE: "border-escalate",
  REQUEST_CONFIRMATION: "border-confirm",
};

const OUTCOME_BG_TINT: Record<Decision["kind"], string> = {
  EXECUTE: "bg-execute/5",
  REFUSE: "bg-refuse/5",
  REWRITE: "bg-rewrite/5",
  DEFER: "bg-defer/5",
  ESCALATE: "bg-escalate/5",
  REQUEST_CONFIRMATION: "bg-confirm/5",
};

const OUTCOME_BG_CHIP: Record<Decision["kind"], string> = {
  EXECUTE: "bg-execute/10",
  REFUSE: "bg-refuse/10",
  REWRITE: "bg-rewrite/10",
  DEFER: "bg-defer/10",
  ESCALATE: "bg-escalate/10",
  REQUEST_CONFIRMATION: "bg-confirm/10",
};

const OUTCOME_BORDER_CHIP: Record<Decision["kind"], string> = {
  EXECUTE: "border-execute/30",
  REFUSE: "border-refuse/30",
  REWRITE: "border-rewrite/30",
  DEFER: "border-defer/30",
  ESCALATE: "border-escalate/30",
  REQUEST_CONFIRMATION: "border-confirm/30",
};

export function WorkedExamplePanel({
  result,
  initialState,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = useState(!compact);
  // Sync expansion with the compact prop — FlowSteps toggles `compact` on
  // older panels when a newer step runs. Older panels should re-collapse.
  // If the visitor manually expanded one and then runs a fresh step, they
  // lose that expansion, which is the lesser evil vs. older panels staying
  // sprawled open behind the latest.
  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);
  const kind = result.decision.kind;
  const compactTime = (result.record.at ?? "").slice(11, 19);

  return (
    <section
      aria-label={`Worked example: ${kind.toLowerCase()}`}
      className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-sm"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-edge px-4 py-3 text-left hover:bg-canvas/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <DecisionBadge kind={kind} size="md" />
          <span className="truncate text-xs text-muted">
            {result.packName}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-faint">
          <span className="font-mono uppercase tracking-section">
            {compactTime || "—"}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {expanded ? (
        <div className="flex flex-col">
          <InputSection envelope={result.record.envelope} kind={kind} initiallyOpen={initialState !== undefined} />
          {initialState !== undefined ? (
            <PreStateSection state={initialState} />
          ) : null}
          <TraceSection trace={result.trace} kind={kind} />
          <DecisionSection result={result} />
          <AuditSection record={result.record} kind={kind} />
        </div>
      ) : null}
    </section>
  );
}

// ── Section header ────────────────────────────────────────────────────

function SectionHeader({
  label,
  outcome,
  outcomeText,
}: {
  label: string;
  outcome?: string;
  outcomeText?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-section text-faint">
        {label}
        {outcome ? (
          <span className={cn("ml-1.5", outcomeText)}>· {outcome}</span>
        ) : null}
      </span>
    </div>
  );
}

// ── INPUT section ─────────────────────────────────────────────────────

function InputSection({
  envelope,
  kind,
  initiallyOpen,
}: {
  envelope: IntentEnvelope;
  kind: Decision["kind"];
  initiallyOpen: boolean;
}) {
  const segments = envelopeToSegments(envelope);
  return (
    <details className="border-b border-edge" open={initiallyOpen}>
      <summary className="cursor-pointer list-none">
        <SectionHeader label="INPUT · envelope" outcomeText={OUTCOME_TEXT_CLASS[kind]} />
      </summary>
      <div className="px-4 py-3">
        <JsonSegmentView segments={segments} highlightClass={OUTCOME_TEXT_CLASS[kind]} />
      </div>
    </details>
  );
}

// ── PRE-STATE section (optional) ──────────────────────────────────────

function PreStateSection({ state }: { state: unknown }) {
  return (
    <details className="border-b border-edge">
      <summary className="cursor-pointer list-none">
        <SectionHeader label="PRE-STATE · pack snapshot" />
      </summary>
      <div className="px-4 py-3">
        <p className="mb-2 text-[11px] leading-snug text-muted">
          The pack&apos;s state when this step ran. Earlier steps may have populated it.
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted">
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
    </details>
  );
}

// ── TRACE section ─────────────────────────────────────────────────────

function TraceSection({
  trace,
  kind,
}: {
  trace: ReadonlyArray<AdjudicationTraceEntry>;
  kind: Decision["kind"];
}) {
  if (trace.length === 0) {
    return (
      <div className="border-b border-edge">
        <SectionHeader label="TRACE · evaluation" />
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted">
            Trace not captured — short-circuit path (e.g. ledger replay suppression).
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="border-b border-edge">
      <SectionHeader label="TRACE · evaluation" outcomeText={OUTCOME_TEXT_CLASS[kind]} />
      <div className="flex flex-col gap-1 px-4 py-3">
        {trace.map((entry, i) => (
          <TraceRow key={i} entry={entry} kind={kind} />
        ))}
      </div>
    </div>
  );
}

function TraceRow({
  entry,
  kind,
}: {
  entry: AdjudicationTraceEntry;
  kind: Decision["kind"];
}) {
  const isMatch = entry.outcome === "match";
  const isDefault = entry.phase === "default" && isMatch;
  const phaseLabel =
    entry.index !== undefined
      ? `${entry.phase}[${entry.index}]`
      : entry.phase;
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-l-2 py-1.5 pl-3",
        isMatch
          ? cn(OUTCOME_BORDER_CLASS[kind], OUTCOME_BG_TINT[kind], "opacity-100")
          : "border-edge opacity-70",
      )}
    >
      <span className="min-w-[88px] flex-none rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[10px] uppercase tracking-section text-muted">
        {phaseLabel}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[12px]",
          isMatch ? "text-ink" : "text-ink/80",
        )}
      >
        {isDefault
          ? `policy.default → ${kind}`
          : (entry.guardName ?? "—")}
      </span>
      <span
        className={cn(
          "flex-none rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-section",
          isMatch
            ? cn(
                OUTCOME_BG_CHIP[kind],
                OUTCOME_BORDER_CHIP[kind],
                "border",
                OUTCOME_TEXT_CLASS[kind],
              )
            : "text-faint",
        )}
      >
        {entry.outcome}
      </span>
    </div>
  );
}

// ── DECISION section ─────────────────────────────────────────────────

function DecisionSection({ result }: { result: PlaygroundResponse }) {
  const kind = result.decision.kind;
  return (
    <div
      className={cn(
        "border-b border-edge border-l-4",
        OUTCOME_BORDER_CLASS[kind],
        OUTCOME_BG_TINT[kind],
      )}
    >
      <SectionHeader
        label="DECISION"
        outcome={kind.toLowerCase()}
        outcomeText={OUTCOME_TEXT_CLASS[kind]}
      />
      <div className="flex flex-col gap-3 px-4 py-3">
        <DecisionBadge kind={kind} size="md" />
        <DecisionBody result={result} />
        <BasisTagList basis={result.decision.basis} />
      </div>
    </div>
  );
}

function DecisionBody({ result }: { result: PlaygroundResponse }) {
  const decision = result.decision;
  switch (decision.kind) {
    case "EXECUTE":
      return (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] text-muted">
            Intent runs against the side-effect.
          </p>
          <p className="font-mono text-[11px] text-ink/80">
            intent.kind: {result.record.envelope.kind}
          </p>
        </div>
      );
    case "REFUSE":
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-refuse/30 bg-refuse/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-section text-refuse">
              {decision.refusal.kind}
            </span>
            <span className="font-mono text-[11px] text-ink/80">
              code: {decision.refusal.code}
            </span>
          </div>
          <blockquote className="border-l-2 border-refuse/40 pl-3 text-[13px] italic text-ink">
            {decision.refusal.userFacing}
          </blockquote>
          {decision.refusal.detail ? (
            <details className="text-[11px] text-muted">
              <summary className="cursor-pointer font-mono uppercase tracking-section text-faint">
                operator detail
              </summary>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-muted">
                {decision.refusal.detail}
              </pre>
            </details>
          ) : null}
        </div>
      );
    case "REWRITE": {
      const before = (result.record.envelope.payload ?? {}) as unknown;
      const after = (decision.rewritten.payload ?? {}) as unknown;
      const diff = payloadDiffSegments(before, after);
      const beforeHash = truncMiddle(
        result.record.envelope.intentHash ?? "<unknown>",
        16,
        6,
      );
      const afterHash = truncMiddle(
        decision.rewritten.intentHash ?? "<unknown>",
        16,
        6,
      );
      return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-md border border-edge bg-canvas/60 px-3 py-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-section text-faint">
                PROPOSED · payload
              </p>
              <JsonSegmentView segments={diff.left} highlightClass="text-rewrite-strong font-semibold" />
            </div>
            <div className="rounded-md border border-rewrite/60 bg-rewrite/5 px-3 py-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-section text-rewrite-strong">
                REWRITTEN · payload
              </p>
              <JsonSegmentView segments={diff.right} highlightClass="text-rewrite-strong font-semibold" />
            </div>
          </div>
          <p className="text-[13px] italic text-ink">
            reason: &ldquo;{decision.reason}&rdquo;
          </p>
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[9px] uppercase tracking-section text-faint">
              INTENT HASH CHANGED
            </p>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <span className="rounded-md border border-edge bg-canvas px-2 py-0.5 text-muted">
                proposed: {beforeHash}
              </span>
              <span className="text-faint">→</span>
              <span className="rounded-md border border-rewrite/60 bg-rewrite/10 px-2 py-0.5 text-rewrite-strong font-semibold">
                rewritten: {afterHash}
              </span>
            </div>
          </div>
        </div>
      );
    }
    case "DEFER":
      return (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] text-ink/80">
            signal: <span className="font-semibold text-defer">{decision.signal}</span>
          </p>
          <p className="font-mono text-[11px] text-ink/80">
            timeoutMs: {decision.timeoutMs}{" "}
            <span className="text-faint">({humaniseTimeoutMs(decision.timeoutMs)})</span>
          </p>
          <p className="text-[12px] text-muted">
            The kernel parks the intent until <code className="font-mono text-ink/80">{decision.signal}</code> fires or {humaniseTimeoutMs(decision.timeoutMs)} elapses.
          </p>
        </div>
      );
    case "ESCALATE": {
      const Icon = decision.to === "human" ? UserCheck : Users;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-section text-faint">
              routed to:
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-escalate/30 bg-escalate/10 px-3 py-1 text-[12px] font-medium text-escalate">
              <Icon size={12} />
              {decision.to}
            </span>
          </div>
          <p className="font-mono text-[11px] italic text-ink">
            reason: {decision.reason}
          </p>
          <p className="text-[12px] text-muted">
            Pending operator action — no side effect runs until cleared.
          </p>
        </div>
      );
    }
    case "REQUEST_CONFIRMATION":
      return (
        <div className="flex flex-col gap-2">
          <div className="rounded-md border-2 border-confirm/40 bg-confirm/5 px-4 py-3">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-section text-confirm">
              KERNEL ASKS
            </p>
            <blockquote className="text-[13px] italic text-ink">
              {decision.prompt}
            </blockquote>
          </div>
          <p className="text-[12px] text-muted">
            The caller re-confirms by re-submitting with a confirmation receipt.
          </p>
        </div>
      );
  }
}

// ── BASIS tag list ───────────────────────────────────────────────────

function BasisTagList({ basis }: { basis: ReadonlyArray<DecisionBasis> }) {
  if (basis.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[9px] uppercase tracking-section text-faint">
        BASIS · {basis.length}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {basis.map((b, i) => {
          const universal =
            b.category === "schema" && b.code === "version_supported";
          const detail =
            "detail" in b && b.detail !== undefined ? b.detail : null;
          return (
            <li
              key={i}
              title={detail ? JSON.stringify(detail) : undefined}
              className={cn(
                "rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px]",
                universal ? "text-faint" : "text-ink",
              )}
            >
              {b.category}:{b.code}
              {detail ? <span className="ml-1 text-faint">?</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── AUDIT section ────────────────────────────────────────────────────

function AuditSection({
  record,
  kind,
}: {
  record: AuditRecord;
  kind: Decision["kind"];
}) {
  const segments = auditToSegments(record);
  return (
    <div>
      <SectionHeader
        label={`AUDIT · record v${record.version}`}
        outcomeText={OUTCOME_TEXT_CLASS[kind]}
      />
      <div className="flex flex-col gap-2 px-4 py-3">
        {kind === "REWRITE" ? (
          <p className="text-[11px] text-muted">
            Note: this is the proposed envelope&apos;s intentHash. The rewritten
            envelope&apos;s hash (<code className="font-mono text-ink/80">decision.rewritten.intentHash</code>) differs — see DECISION above.
          </p>
        ) : null}
        <JsonSegmentView segments={segments} highlightClass={OUTCOME_TEXT_CLASS[kind]} />
      </div>
    </div>
  );
}

// ── JSON segment renderer ────────────────────────────────────────────

function JsonSegmentView({
  segments,
  highlightClass,
}: {
  segments: ReadonlyArray<JsonSegment>;
  highlightClass: string;
}) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink/85">
      {segments.map((seg, i) => (
        <span key={i}>
          <span className="text-muted">{seg.before}</span>
          {seg.highlight ? (
            <span className={highlightClass}>{seg.highlight}</span>
          ) : null}
          {seg.after ? <span className="text-muted">{seg.after}</span> : null}
          {i < segments.length - 1 ? "\n" : null}
        </span>
      ))}
    </pre>
  );
}
