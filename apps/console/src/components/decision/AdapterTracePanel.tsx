import type { AuditRecord } from "@adjudicate/core";
import {
  detectAdapter,
  getAdapterTraceComponent,
} from "@/lib/adapter-trace-registry";

export function AdapterTracePanel({ record }: { record: AuditRecord }) {
  const adapterId = detectAdapter(record);
  const Component = adapterId ? getAdapterTraceComponent(adapterId) : undefined;

  if (!adapterId) {
    return (
      <p className="italic text-[11px] text-faint">
        No adapter detected — envelope was authored directly by the application, or no adapter trace renderer is registered.
      </p>
    );
  }

  if (!Component) {
    return (
      <p className="italic text-[11px] text-faint">
        Adapter <code className="text-muted">{adapterId}</code> detected. No trace renderer registered. Adapter packages register one via{" "}
        <code className="text-muted">registerAdapterTrace()</code>.
      </p>
    );
  }

  return <Component record={record} />;
}
