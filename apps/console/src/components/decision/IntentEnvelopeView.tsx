import type { IntentEnvelope } from "@adjudicate/core";

export function IntentEnvelopeView({
  envelope,
}: {
  envelope: IntentEnvelope;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[11px]">
        <Field label="kind" value={envelope.kind} />
        <Field label="version" value={`v${envelope.version}`} />
        <Field
          label="actor"
          value={`${envelope.actor.principal} · ${envelope.actor.sessionId}`}
        />
        <Field label="taint" value={envelope.taint} />
        <Field label="nonce" value={envelope.nonce} />
        <Field label="createdAt" value={envelope.createdAt} />
      </dl>
      <details className="group">
        <summary className="cursor-pointer text-[10px] uppercase tracking-section text-faint hover:text-muted">
          ▸ payload
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-sm border border-edge bg-canvas p-2 text-[11px] leading-relaxed">
          <code>{JSON.stringify(envelope.payload, null, 2)}</code>
        </pre>
      </details>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="break-all text-ink/90">{value}</dd>
    </>
  );
}
