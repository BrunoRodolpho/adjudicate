import type { AuditRecord } from "@adjudicate/core";
import { IntentHashChip } from "./IntentHashChip";

export function AuditMetadata({ record }: { record: AuditRecord }) {
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-faint">version</dt>
        <dd className="text-muted">v{record.version}</dd>
        <dt className="text-faint">at</dt>
        <dd className="text-muted">{record.at}</dd>
        <dt className="text-faint">durationMs</dt>
        <dd className="tabular-nums text-muted">{record.durationMs}</dd>
        {record.resourceVersion ? (
          <>
            <dt className="text-faint">resourceVersion</dt>
            <dd className="text-muted">{record.resourceVersion}</dd>
          </>
        ) : null}
        <dt className="text-faint">intentHash</dt>
        <dd>
          <IntentHashChip hash={record.intentHash} full />
        </dd>
      </dl>
      <p className="text-[10px] text-faint">
        intentHash is sha256(canonical(envelope.{"{kind, payload, nonce, actor, taint, version}"})). Idempotency / replay key — not a signed attestation.
      </p>
      <details className="group">
        <summary className="cursor-pointer text-[10px] uppercase tracking-section text-faint hover:text-muted">
          ▸ raw record (JSON)
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-sm border border-edge bg-canvas p-2 text-[11px] leading-relaxed">
          <code>{JSON.stringify(record, null, 2)}</code>
        </pre>
      </details>
    </div>
  );
}
