import type { AuditPlanSnapshot } from "@adjudicate/core";
import { IntentHashChip } from "./IntentHashChip";

export function PlanSnapshotPanel({ plan }: { plan: AuditPlanSnapshot }) {
  return (
    <div className="grid gap-2 text-[11px]">
      <PlanRow label="visibleReadTools" values={plan.visibleReadTools} />
      <PlanRow label="allowedIntents" values={plan.allowedIntents} />
      <PlanRow label="forbiddenConcepts" values={plan.forbiddenConcepts} />
      <div className="flex items-center gap-2 pt-1 text-faint">
        <span className="text-[10px] uppercase tracking-section">
          fingerprint
        </span>
        <IntentHashChip hash={plan.planFingerprint} />
      </div>
    </div>
  );
}

function PlanRow({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-section text-faint">
        {label}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="italic text-faint">none</span>
        ) : (
          values.map((v) => (
            <code
              key={v}
              className="rounded-sm border border-edge bg-canvas px-1.5 py-0.5 text-[11px] text-ink/90"
            >
              {v}
            </code>
          ))
        )}
      </div>
    </div>
  );
}
