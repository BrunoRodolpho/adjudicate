/**
 * Shared color/label tokens for `GuardDescription.kind` values.
 *
 * Ported into the console from `apps/web/src/lib/guard-colors.ts` (there is no
 * cross-app import path) and extended with `data_classification`. The canonical
 * kinds are the closed ADR-105 vocabulary (`packages/core/src/kernel/policy.ts`).
 * `unknown` is the synthetic fallback for guards that carry a name but no
 * structured `description`. Tooling MUST tolerate unknown kinds (ADR-105 rule 1).
 *
 * Used by the rule-provenance tree (`/policy-tree`).
 */

export const GUARD_KIND_INFO: Record<
  string,
  { fill: string; label: string; oneLiner: string }
> = {
  threshold: {
    fill: "fill-defer stroke-defer",
    label: "threshold",
    oneLiner: "Numeric threshold (amount cap, ramp%, etc.)",
  },
  state_defer: {
    fill: "fill-confirm stroke-confirm",
    label: "state_defer",
    oneLiner: "DEFER on an external signal",
  },
  system_taint: {
    fill: "fill-escalate stroke-escalate",
    label: "system_taint",
    oneLiner: "Taint-gated kind allow-list",
  },
  rewrite: {
    fill: "fill-rewrite stroke-rewrite",
    label: "rewrite",
    oneLiner: "REWRITE — kernel modifies the envelope",
  },
  data_classification: {
    fill: "fill-rewrite stroke-rewrite",
    label: "data_classification",
    oneLiner: "PII/sensitivity scan — REWRITE-redact or REFUSE",
  },
  opaque: {
    fill: "fill-faint stroke-faint",
    label: "opaque",
    oneLiner: "Free-form guard — analyzers fall back to name",
  },
  unknown: {
    fill: "fill-faint stroke-faint",
    label: "unknown",
    oneLiner: "No structured description attached",
  },
};

/** Text color token per kind, for the policy-tree's left stripe + kind chip. */
export const GUARD_KIND_TEXT: Record<string, string> = {
  threshold: "text-amber-300",
  state_defer: "text-sky-300",
  system_taint: "text-violet-300",
  rewrite: "text-orange-300",
  data_classification: "text-orange-300",
  opaque: "text-faint",
  unknown: "text-faint",
};

export function guardKindInfo(kind: string | undefined) {
  return GUARD_KIND_INFO[kind ?? "unknown"] ?? GUARD_KIND_INFO.unknown!;
}

export function guardKindText(kind: string | undefined): string {
  return GUARD_KIND_TEXT[kind ?? "unknown"] ?? GUARD_KIND_TEXT.unknown!;
}
