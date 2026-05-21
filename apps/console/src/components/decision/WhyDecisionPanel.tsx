import {
  DEFAULT_EXPLANATION_REGISTRY,
  explainRecord,
  type AuditRecord,
} from "@adjudicate/core";

/**
 * Why-this-decision panel — renders `explainRecord` output as a human-readable
 * headline + bulleted basis explanation. Uses the kernel's default English
 * registry; adopters with custom basis codes pass their own registry through
 * `WhyDecisionPanel`'s props (Phase 2 work).
 *
 * Previously exported as `WhyNotPanel` — renamed when T-081 introduced the
 * sibling "Why not other decisions" panel; this one is the existing
 * single-decision explanation.
 */
export function WhyDecisionPanel({ record }: { record: AuditRecord }) {
  const explanation = explainRecord(record, DEFAULT_EXPLANATION_REGISTRY);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-ink">{explanation.headline}</p>
      <ul className="ml-4 list-disc text-[11px] text-muted marker:text-faint">
        {explanation.bullets.map((bullet, i) => (
          <li key={i} className="leading-relaxed">
            {bullet}
          </li>
        ))}
      </ul>
      <p className="pt-1 text-[10px] uppercase tracking-wider text-faint">
        Locale: {explanation.locale}
      </p>
    </div>
  );
}
