import type { AuditRecord } from "@adjudicate/core";
import { ReplayButton } from "@/components/replay/ReplayButton";
import { AdapterTracePanel } from "./AdapterTracePanel";
import { AuditMetadata } from "./AuditMetadata";
import { BasisFlatSet } from "./BasisFlatSet";
import { DecisionTraceHeader } from "./DecisionTraceHeader";
import { IntentEnvelopeView } from "./IntentEnvelopeView";
import { PlanSnapshotPanel } from "./PlanSnapshotPanel";
import { PolicyResolutionList } from "./PolicyResolutionList";
import { RefusalCard } from "./RefusalCard";
import { Section } from "./Section";

/**
 * DecisionTrace — flagship component of the Audit Explorer.
 *
 * Renders one `AuditRecord` as a high-density, IDE-feel block. All six
 * Decision kinds are first-class — REFUSE shows a Refusal card, ESCALATE
 * shows the supervisor target + reason, REQUEST_CONFIRMATION shows the
 * prompt, DEFER shows signal + timeout, REWRITE shows the sanitized payload
 * diff. EXECUTE shows just the basis. Six-outcome ground truth, no collapse
 * to ALLOW/BLOCK/HOLD/MODIFY.
 */
export function DecisionTrace({ record }: { record: AuditRecord }) {
  return (
    <article className="overflow-hidden rounded-sm border border-edge bg-panel/40">
      <DecisionTraceHeader record={record} />

      <div className="flex items-center justify-end gap-2 border-b border-edge bg-canvas/40 px-3 py-1.5">
        <ReplayButton
          intentHash={record.intentHash}
          intentKind={record.envelope.kind}
          variant="button"
        />
      </div>

      <Section title="Intent Envelope" defaultOpen>
        <IntentEnvelopeView envelope={record.envelope} />
      </Section>

      <Section title="Policy Resolution" defaultOpen>
        <PolicyResolutionList record={record} />
      </Section>

      <Section title={`Decision · ${record.decision.kind}`} defaultOpen>
        <DecisionBody record={record} />
      </Section>

      {record.plan ? (
        <Section title="Plan Snapshot">
          <PlanSnapshotPanel plan={record.plan} />
        </Section>
      ) : null}

      <Section title="Adapter Trace">
        <AdapterTracePanel record={record} />
      </Section>

      <Section title="Audit Metadata">
        <AuditMetadata record={record} />
      </Section>
    </article>
  );
}

function DecisionBody({ record }: { record: AuditRecord }) {
  const d = record.decision;
  return (
    <div className="flex flex-col gap-2">
      {d.kind === "REFUSE" ? <RefusalCard refusal={d.refusal} /> : null}

      {d.kind === "ESCALATE" ? (
        <KindRow label="to" value={d.to}>
          <p className="text-[11px] text-muted">{d.reason}</p>
        </KindRow>
      ) : null}

      {d.kind === "REQUEST_CONFIRMATION" ? (
        <KindRow label="prompt">
          <p className="italic text-[11px] text-muted">"{d.prompt}"</p>
        </KindRow>
      ) : null}

      {d.kind === "DEFER" ? (
        <KindRow label="signal" value={d.signal}>
          <p className="text-[11px] text-muted">
            timeout: {(d.timeoutMs / 1000).toFixed(0)}s
          </p>
        </KindRow>
      ) : null}

      {d.kind === "REWRITE" ? (
        <KindRow label="rewritten">
          <div className="flex flex-col gap-1.5 rounded-sm border border-orange-500/30 bg-orange-500/5 p-2">
            <p className="text-[11px] text-orange-200">{d.reason}</p>
            <pre className="overflow-x-auto rounded-sm border border-edge bg-canvas p-1.5 text-[10px]">
              <code>{JSON.stringify(d.rewritten.payload, null, 2)}</code>
            </pre>
          </div>
        </KindRow>
      ) : null}

      <div className="pt-1">
        <div className="mb-1 text-[10px] uppercase tracking-section text-faint">
          basis
        </div>
        <BasisFlatSet basis={d.basis} />
      </div>
    </div>
  );
}

function KindRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-[10px] uppercase tracking-wider text-faint">
          {label}
        </span>
        {value ? <code className="text-ink">{value}</code> : null}
      </div>
      {children}
    </div>
  );
}
