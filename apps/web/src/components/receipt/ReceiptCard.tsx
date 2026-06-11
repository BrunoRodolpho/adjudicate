import { UserCheck, Users } from "lucide-react";
import type {
  AdjudicationTraceEntry,
  AuditRecord,
  Decision,
  DecisionBasis,
  DecisionKind,
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
import { explainBasis } from "@/content/basis-explanations";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { cn } from "@/lib/cn";

/**
 * ReceiptCard — the single, reusable rendering of one kernel decision.
 *
 * Pure SERVER component (no hooks, no client state). Progressive disclosure
 * uses native <details>. Reused by the homepage, both playground modes (via
 * the WorkedExamplePanel wrapper), and the console decision-detail replica.
 *
 * View-model: pass `result` (a PlaygroundResponse — decision + record + trace)
 * OR `record` alone (a stored AuditRecord). When only `record` is given, the
 * card renders from it without a trace section.
 *
 *   variant "full"            — every section, comfortable spacing (default).
 *   variant "compact"         — same sections, tighter; suited to list rows.
 *   variant "inline-console"  — the console decision-detail replica; trace on
 *                               by default, packName chrome suppressed.
 *
 * Decision colour is sourced from the DECISIONS palette via DecisionChip and
 * the OUTCOME_* class maps below (the same tokens WorkedExamplePanel used).
 */

type ReceiptVariant = "full" | "compact" | "inline-console";

interface ReceiptCardProps {
  /** A full playground run (decision + record + trace). */
  readonly result?: PlaygroundResponse;
  /** A stored audit record on its own (e.g. console history row). */
  readonly record?: AuditRecord;
  readonly variant?: ReceiptVariant;
  /**
   * Render the evaluation trace section. Defaults to true for the
   * "inline-console" variant, false otherwise. Only ever shows when a
   * `result` (with a trace) was supplied.
   */
  readonly showTrace?: boolean;
  readonly className?: string;
  /**
   * Suppress the card's own header strip (DecisionChip + packName + time).
   * Used when the card nests inside another container that already renders
   * an equivalent header — e.g. the playground's WorkedExamplePanel strip.
   */
  readonly hideHeader?: boolean;
}

// ── Decision → colour class maps (DECISIONS-palette tokens) ────────────

const OUTCOME_TEXT_CLASS: Record<DecisionKind, string> = {
  EXECUTE: "text-execute",
  REFUSE: "text-refuse",
  REWRITE: "text-rewrite-strong",
  DEFER: "text-defer",
  ESCALATE: "text-escalate",
  REQUEST_CONFIRMATION: "text-confirm",
};

const OUTCOME_BORDER_CLASS: Record<DecisionKind, string> = {
  EXECUTE: "border-execute",
  REFUSE: "border-refuse",
  REWRITE: "border-rewrite",
  DEFER: "border-defer",
  ESCALATE: "border-escalate",
  REQUEST_CONFIRMATION: "border-confirm",
};

const OUTCOME_BG_TINT: Record<DecisionKind, string> = {
  EXECUTE: "bg-execute/5",
  REFUSE: "bg-refuse/5",
  REWRITE: "bg-rewrite/5",
  DEFER: "bg-defer/5",
  ESCALATE: "bg-escalate/5",
  REQUEST_CONFIRMATION: "bg-confirm/5",
};

const OUTCOME_BG_CHIP: Record<DecisionKind, string> = {
  EXECUTE: "bg-execute/10",
  REFUSE: "bg-refuse/10",
  REWRITE: "bg-rewrite/10",
  DEFER: "bg-defer/10",
  ESCALATE: "bg-escalate/10",
  REQUEST_CONFIRMATION: "bg-confirm/10",
};

const OUTCOME_BORDER_CHIP: Record<DecisionKind, string> = {
  EXECUTE: "border-execute/30",
  REFUSE: "border-refuse/30",
  REWRITE: "border-rewrite/30",
  DEFER: "border-defer/30",
  ESCALATE: "border-escalate/30",
  REQUEST_CONFIRMATION: "border-confirm/30",
};

/**
 * The shortest plain-English gloss of WHAT the kernel did, keyed only by the
 * decision kind. Rendered as the first line a reader sees in the DECISION
 * section — before the raw refusal codes, diffs, and signals below it. Wording
 * is kept in lock-step with the playground's guided narration so a receipt
 * reads the same whether it lands in guided mode, the sandbox, or the console.
 */
const PLAIN_OUTCOME_SUMMARY: Record<DecisionKind, string> = {
  EXECUTE: "The kernel approved the request as-is.",
  REFUSE: "The kernel blocked the request.",
  REWRITE: "The kernel approved a modified version.",
  DEFER: "The kernel paused the request pending a signal.",
  ESCALATE: "The kernel routed the request to a reviewer.",
  REQUEST_CONFIRMATION: "The kernel asked the caller to confirm.",
};

// ── View model ─────────────────────────────────────────────────────────

interface ReceiptModel {
  readonly decision: Decision;
  readonly record: AuditRecord;
  readonly envelope: IntentEnvelope;
  readonly kind: DecisionKind;
  readonly trace: ReadonlyArray<AdjudicationTraceEntry> | null;
  readonly packName: string | null;
}

function toModel(props: ReceiptCardProps): ReceiptModel | null {
  if (props.result) {
    const r = props.result;
    return {
      decision: r.decision,
      record: r.record,
      envelope: r.record.envelope,
      kind: r.decision.kind,
      trace: r.trace,
      packName: r.packName,
    };
  }
  if (props.record) {
    const rec = props.record;
    return {
      decision: rec.decision,
      record: rec,
      envelope: rec.envelope,
      kind: rec.decision.kind,
      trace: null,
      packName: null,
    };
  }
  return null;
}

export function ReceiptCard(props: ReceiptCardProps) {
  const model = toModel(props);
  if (!model) return null;

  const variant: ReceiptVariant = props.variant ?? "full";
  const compact = variant === "compact";
  const isConsole = variant === "inline-console";
  const showTrace = props.showTrace ?? isConsole;
  const { kind, decision, record, envelope } = model;
  const at = record.at ?? "";
  const compactTime = at.slice(11, 19);

  return (
    <section
      aria-label={`Decision receipt: ${kind.toLowerCase()}`}
      className={cn(
        "overflow-hidden rounded-2xl border border-edge bg-surface shadow-sm",
        props.className,
      )}
    >
      {props.hideHeader ? null : (
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <DecisionChip kind={kind} size={compact ? "sm" : "md"} />
            {model.packName ? (
              <span className="truncate text-xs text-muted">
                {model.packName}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="font-mono uppercase tracking-section">
              {compactTime || "—"}
            </span>
          </div>
        </header>
      )}

      <div className="flex flex-col">
        <InputSection envelope={envelope} kind={kind} />
        {showTrace && model.trace ? (
          <TraceSection trace={model.trace} kind={kind} />
        ) : null}
        <DecisionSection
          decision={decision}
          record={record}
          compact={compact}
        />
        <BasisSection basis={decision.basis} kind={kind} />
        <AuditSection record={record} kind={kind} />
        <CryptoSection record={record} decision={decision} kind={kind} />
      </div>
    </section>
  );
}

// ── Section header ─────────────────────────────────────────────────────

function SectionHeader({
  label,
  outcome,
  outcomeText,
  emphasis = false,
}: {
  readonly label: string;
  readonly outcome?: string;
  readonly outcomeText?: string;
  /**
   * Render the header a half-step louder. Used by the DECISION section so the
   * card's centerpiece is scannable at a glance against the supporting
   * (collapsible) detail sections, which all share the quiet `[10px]` heading.
   */
  readonly emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
      <span
        className={cn(
          "font-mono uppercase tracking-section",
          emphasis
            ? cn("text-[11px] font-semibold", outcomeText ?? "text-ink")
            : "text-[10px] text-muted",
        )}
      >
        {label}
        {outcome ? (
          <span
            className={cn("ml-1.5", emphasis ? undefined : outcomeText)}
          >
            · {outcome}
          </span>
        ) : null}
      </span>
    </div>
  );
}

// ── INPUT section ──────────────────────────────────────────────────────

function InputSection({
  envelope,
  kind,
}: {
  readonly envelope: IntentEnvelope;
  readonly kind: DecisionKind;
}) {
  const segments = envelopeToSegments(envelope);
  return (
    <details className="border-b border-edge">
      <summary aria-label="Show input envelope" className="cursor-pointer list-none">
        <SectionHeader
          label="INPUT · envelope"
          outcome={envelope.taint}
          outcomeText="text-muted"
        />
      </summary>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded-md border border-edge bg-canvas px-2 py-0.5 text-muted">
            kind: <span className="text-ink/80">{envelope.kind}</span>
          </span>
          <TaintChip taint={envelope.taint} />
        </div>
        <JsonSegmentView
          segments={segments}
          highlightClass={OUTCOME_TEXT_CLASS[kind]}
          label="Request envelope (JSON)"
        />
      </div>
    </details>
  );
}

function TaintChip({ taint }: { readonly taint: IntentEnvelope["taint"] }) {
  const tone =
    taint === "SYSTEM"
      ? "border-execute/30 bg-execute/10 text-execute"
      : taint === "TRUSTED"
        ? "border-confirm/30 bg-confirm/10 text-confirm"
        : "border-defer/30 bg-defer/10 text-defer";
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-section",
        tone,
      )}
    >
      taint: {taint}
    </span>
  );
}

// ── TRACE section ──────────────────────────────────────────────────────

function TraceSection({
  trace,
  kind,
}: {
  readonly trace: ReadonlyArray<AdjudicationTraceEntry>;
  readonly kind: DecisionKind;
}) {
  if (trace.length === 0) {
    return (
      <div className="border-b border-edge">
        <SectionHeader label="TRACE · evaluation" />
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted">
            Trace not captured — short-circuit path (e.g. ledger replay
            suppression).
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="border-b border-edge">
      <SectionHeader
        label="TRACE · evaluation"
        outcomeText={OUTCOME_TEXT_CLASS[kind]}
      />
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
  readonly entry: AdjudicationTraceEntry;
  readonly kind: DecisionKind;
}) {
  const isMatch = entry.outcome === "match";
  const isDefault = entry.phase === "default" && isMatch;
  const phaseLabel =
    entry.index !== undefined ? `${entry.phase}[${entry.index}]` : entry.phase;
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
        {isDefault ? `policy.default → ${kind}` : (entry.guardName ?? "—")}
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
            : "text-muted",
        )}
      >
        {entry.outcome}
      </span>
    </div>
  );
}

// ── DECISION section ───────────────────────────────────────────────────

function DecisionSection({
  decision,
  record,
  compact,
}: {
  readonly decision: Decision;
  readonly record: AuditRecord;
  readonly compact: boolean;
}) {
  const kind = decision.kind;
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
        emphasis
      />
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {compact ? null : <DecisionChip kind={kind} size="md" />}
          <p className={cn("text-[13px] font-medium leading-snug", OUTCOME_TEXT_CLASS[kind])}>
            {PLAIN_OUTCOME_SUMMARY[kind]}
          </p>
        </div>
        <DecisionBody decision={decision} record={record} />
      </div>
    </div>
  );
}

function DecisionBody({
  decision,
  record,
}: {
  readonly decision: Decision;
  readonly record: AuditRecord;
}) {
  switch (decision.kind) {
    case "EXECUTE":
      return (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] text-muted">
            Intent runs against the side-effect.
          </p>
          <p className="font-mono text-[11px] text-ink/80">
            intent.kind: {record.envelope.kind}
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
              <summary className="cursor-pointer font-mono uppercase tracking-section text-muted">
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
      const before = (record.envelope.payload ?? {}) as unknown;
      const after = (decision.rewritten.payload ?? {}) as unknown;
      const diff = payloadDiffSegments(before, after);
      const beforeHash = truncMiddle(
        record.envelope.intentHash ?? "<unknown>",
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
              <p className="mb-1 font-mono text-[9px] uppercase tracking-section text-muted">
                PROPOSED · payload
              </p>
              <JsonSegmentView
                segments={diff.left}
                highlightClass="text-rewrite-strong font-semibold"
              />
            </div>
            <div className="rounded-md border border-rewrite/60 bg-rewrite/5 px-3 py-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-section text-rewrite-strong">
                REWRITTEN · payload
              </p>
              <JsonSegmentView
                segments={diff.right}
                highlightClass="text-rewrite-strong font-semibold"
              />
            </div>
          </div>
          <p className="text-[13px] italic text-ink">
            reason: &ldquo;{decision.reason}&rdquo;
          </p>
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[9px] uppercase tracking-section text-muted">
              INTENT HASH CHANGED
            </p>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <span className="rounded-md border border-edge bg-canvas px-2 py-0.5 text-muted">
                proposed: {beforeHash}
              </span>
              <span className="text-faint">→</span>
              <span className="rounded-md border border-rewrite/60 bg-rewrite/10 px-2 py-0.5 font-semibold text-rewrite-strong">
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
            signal:{" "}
            <span className="font-semibold text-defer">{decision.signal}</span>
          </p>
          <p className="font-mono text-[11px] text-ink/80">
            timeoutMs: {decision.timeoutMs}{" "}
            <span className="text-muted">
              ({humaniseTimeoutMs(decision.timeoutMs)})
            </span>
          </p>
          <p className="text-[12px] text-muted">
            The kernel parks the intent until{" "}
            <code className="font-mono text-ink/80">{decision.signal}</code>{" "}
            fires or {humaniseTimeoutMs(decision.timeoutMs)} elapses.
          </p>
        </div>
      );
    case "ESCALATE": {
      const Icon = decision.to === "human" ? UserCheck : Users;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-section text-muted">
              routed to:
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-escalate/30 bg-escalate/10 px-3 py-1 text-[12px] font-medium text-escalate">
              <Icon size={12} aria-hidden="true" />
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

// ── BASIS section (decision-coloured, plain-English annotated) ──────────

function BasisSection({
  basis,
  kind,
}: {
  readonly basis: ReadonlyArray<DecisionBasis>;
  readonly kind: DecisionKind;
}) {
  if (basis.length === 0) return null;
  return (
    <details className="border-b border-edge">
      <summary aria-label="Show decision basis" className="cursor-pointer list-none">
        <SectionHeader
          label={`BASIS · ${basis.length}`}
          outcome="why"
          outcomeText={OUTCOME_TEXT_CLASS[kind]}
        />
      </summary>
      <ul className="flex flex-col gap-2 px-4 py-3">
        {basis.map((b, i) => (
          <BasisRow key={i} basis={b} kind={kind} />
        ))}
      </ul>
    </details>
  );
}

function BasisRow({
  basis,
  kind,
}: {
  readonly basis: DecisionBasis;
  readonly kind: DecisionKind;
}) {
  const key = `${basis.category}:${basis.code}`;
  const universal =
    basis.category === "schema" && basis.code === "version_supported";
  const plain = explainBasis(basis.category, basis.code);
  const detail =
    "detail" in basis && basis.detail !== undefined ? basis.detail : null;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <code
          className={cn(
            "rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px]",
            universal ? "text-muted" : OUTCOME_TEXT_CLASS[kind],
          )}
        >
          {key}
        </code>
        {detail ? (
          <code className="font-mono text-[10px] text-muted">
            {JSON.stringify(detail)}
          </code>
        ) : null}
      </div>
      {plain ? (
        <p className="text-[12px] leading-snug text-muted">{plain}</p>
      ) : (
        <p className="text-[11px] italic leading-snug text-muted">
          No canonical explanation for this code.
        </p>
      )}
    </li>
  );
}

// ── AUDIT section ──────────────────────────────────────────────────────

function AuditSection({
  record,
  kind,
}: {
  readonly record: AuditRecord;
  readonly kind: DecisionKind;
}) {
  const segments = auditToSegments(record);
  return (
    <details className="border-b border-edge">
      <summary aria-label="Show audit record" className="cursor-pointer list-none">
        <SectionHeader
          label={`AUDIT · record v${record.version}`}
          outcome="expand"
          outcomeText={OUTCOME_TEXT_CLASS[kind]}
        />
      </summary>
      <div className="flex flex-col gap-2 px-4 py-3">
        {kind === "REWRITE" ? (
          <p className="text-[11px] text-muted">
            Note: this is the proposed envelope&apos;s intentHash. The rewritten
            envelope&apos;s hash (
            <code className="font-mono text-ink/80">
              decision.rewritten.intentHash
            </code>
            ) differs — see DECISION above.
          </p>
        ) : null}
        <JsonSegmentView
          segments={segments}
          highlightClass={OUTCOME_TEXT_CLASS[kind]}
          label="Audit record (JSON)"
        />
      </div>
    </details>
  );
}

// ── CRYPTOGRAPHIC DETAIL section ───────────────────────────────────────

function CryptoSection({
  record,
  decision,
  kind,
}: {
  readonly record: AuditRecord;
  readonly decision: Decision;
  readonly kind: DecisionKind;
}) {
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [];

  rows.push({ label: "intentHash", value: record.intentHash });
  if (decision.kind === "REWRITE") {
    rows.push({
      label: "rewritten.intentHash",
      value: decision.rewritten.intentHash,
    });
  }
  if (record.auditHash !== undefined) {
    rows.push({ label: "auditHash", value: record.auditHash });
  }
  if (record.signature !== undefined) {
    rows.push({
      label: "signature",
      value: `${record.signature.alg} · ${record.signature.keyId} · ${record.signature.value}`,
    });
  }
  if (record.kernelIdentity !== undefined) {
    rows.push({
      label: "kernelIdentity",
      value: `${record.kernelIdentity.id} @ ${record.kernelIdentity.version}`,
    });
  }
  if (record.policyVersion !== undefined) {
    rows.push({ label: "policyVersion", value: record.policyVersion });
  }
  if (record.kernelVersion !== undefined) {
    rows.push({ label: "kernelVersion", value: record.kernelVersion });
  }

  const metadataEntries =
    record.metadata !== undefined ? Object.entries(record.metadata) : [];

  if (rows.length === 0 && metadataEntries.length === 0) return null;

  return (
    <details className="group">
      <summary aria-label="Show cryptographic detail" className="cursor-pointer list-none">
        <SectionHeader
          label="CRYPTOGRAPHIC DETAIL"
          outcome="expand"
          outcomeText={OUTCOME_TEXT_CLASS[kind]}
        />
      </summary>
      <div className="flex flex-col gap-1.5 px-4 py-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-0.5 border-b border-edge/60 pb-1.5 last:border-0 last:pb-0 md:flex-row md:items-baseline md:gap-3"
          >
            <span className="min-w-[140px] flex-none font-mono text-[10px] uppercase tracking-section text-muted">
              {row.label}
            </span>
            <span className="min-w-0 break-all font-mono text-[11px] text-ink/85">
              {row.value}
            </span>
          </div>
        ))}
        {metadataEntries.length > 0 ? (
          <div className="mt-1 flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-section text-muted">
              metadata · v5
            </span>
            {metadataEntries.map(([k, v]) => (
              <div
                key={k}
                className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3"
              >
                <span className="min-w-[140px] flex-none font-mono text-[10px] text-muted">
                  {k}
                </span>
                <span className="min-w-0 break-all font-mono text-[11px] text-ink/85">
                  {typeof v === "string" ||
                  typeof v === "number" ||
                  typeof v === "boolean"
                    ? String(v)
                    : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

// ── JSON segment renderer ──────────────────────────────────────────────

function JsonSegmentView({
  segments,
  highlightClass,
  label,
}: {
  readonly segments: ReadonlyArray<JsonSegment>;
  readonly highlightClass: string;
  /** Accessible name for the JSON block, e.g. "Request envelope (JSON)". */
  readonly label?: string;
}) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink/85"
    >
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
