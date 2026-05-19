/**
 * Renders the structured fields of a `GuardDescription` per its `kind`.
 * The closed vocabulary lives at packages/core/src/kernel/policy.ts:81-128.
 *
 * Tooling MUST tolerate unknown `kind` values (ADR-105 rule 1) — anything
 * not matched here is rendered as a key/value dump so analyzers see
 * forward-compatible fields without the renderer breaking.
 *
 * Used by:
 *   - apps/web/src/sections/playground/PackInspector.tsx
 *   - apps/web/src/sections/GuardMetadataGraph.tsx (hover panel)
 */
export function GuardDescriptionDetail({
  kind,
  description,
  size = "sm",
}: {
  kind: string | undefined;
  description: Record<string, unknown> | undefined;
  size?: "sm" | "md";
}) {
  if (!description) return null;
  const fields: Array<[string, unknown]> = [];
  switch (kind) {
    case "threshold":
      if (description.threshold !== undefined) fields.push(["threshold", description.threshold]);
      if (description.comparator) fields.push(["comparator", description.comparator]);
      if (description.emits) fields.push(["emits", description.emits]);
      break;
    case "state_defer":
      if (description.signal) fields.push(["signal", description.signal]);
      if (description.timeoutMs !== undefined) fields.push(["timeoutMs", description.timeoutMs]);
      break;
    case "system_taint":
      if (Array.isArray(description.systemOnlyKinds))
        fields.push(["systemOnlyKinds", description.systemOnlyKinds.join(", ")]);
      break;
    case "rewrite":
      if (Array.isArray(description.mutatesPayloadFields))
        fields.push(["mutatesPayloadFields", description.mutatesPayloadFields.join(", ")]);
      break;
    case "opaque":
      // Per ADR-105 rule 8, `opaque.note` is a human breadcrumb only —
      // surface it but do not parse meaning from it.
      if (description.note) fields.push(["note", description.note]);
      break;
    default:
      // Unknown kind — dump anything that isn't `kind` itself.
      for (const [k, v] of Object.entries(description)) {
        if (k !== "kind") fields.push([k, v]);
      }
  }
  if (fields.length === 0) return null;
  const fontSize = size === "md" ? "text-[12px]" : "text-[10px]";
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-0.5">
      {fields.map(([k, v]) => (
        <span key={k} className={`font-mono ${fontSize} text-muted`}>
          <span className="text-faint">{k}:</span> {String(v)}
        </span>
      ))}
    </div>
  );
}
