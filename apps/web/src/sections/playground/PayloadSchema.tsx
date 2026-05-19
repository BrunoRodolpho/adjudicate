"use client";

import { INTENT_SCHEMAS } from "@/content/intent-schemas";

/**
 * Payload schema panel rendered below the JSON textarea in Decision Lab.
 * Looks up the schema by `intentKind` and renders a two-column field
 * table. Falls back to a "no schema documented" message for unknown
 * intent kinds (so visitors who type something custom get a sensible
 * answer, not a crash).
 */
export function PayloadSchema({ intentKind }: { intentKind: string }) {
  const schema = INTENT_SCHEMAS[intentKind];
  if (!schema) {
    return (
      <div className="rounded-md border border-dashed border-edge bg-canvas p-3 text-[11px] italic text-faint">
        No schema documented for <code className="not-italic text-ink">{intentKind || "(empty)"}</code>. The kernel will return REFUSE if no installed Pack handles this intent kind.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-edge bg-canvas p-3">
      <p className="mb-2 text-[10px] uppercase tracking-section text-faint">
        Payload fields
      </p>
      <ul className="flex flex-col gap-1.5">
        {schema.fields.map((f) => (
          <li key={f.name} className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <code className="text-[12px] text-ink">{f.name}</code>
              <code className="text-[10px] text-muted">{f.type}</code>
            </div>
            <p className="text-[11px] leading-snug text-muted">{f.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
