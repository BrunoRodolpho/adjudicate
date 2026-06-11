/**
 * Renders the structured fields of a `GuardDescription` per its `kind`.
 *
 * Ported into the console from `apps/web/src/components/playground/
 * GuardDescriptionDetail.tsx` and extended with the `data_classification`
 * variant. The closed vocabulary lives at packages/core/src/kernel/policy.ts.
 *
 * Tooling MUST tolerate unknown `kind` values (ADR-105 rule 1) — anything not
 * matched here is rendered as a key/value dump so forward-compatible fields
 * surface without the renderer breaking.
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
    case "data_classification":
      if (description.sensitivityLevel)
        fields.push(["sensitivityLevel", description.sensitivityLevel]);
      if (description.action) fields.push(["action", description.action]);
      if (Array.isArray(description.scannedFields))
        fields.push(["scannedFields", description.scannedFields.join(", ")]);
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
