/**
 * Shared color/label tokens for `GuardDescription.kind` values.
 *
 * The five canonical kinds (`threshold`, `state_defer`, `system_taint`,
 * `rewrite`, `opaque`) are defined as a closed vocabulary in ADR-105
 * (`packages/core/src/kernel/policy.ts:81-128`). `unknown` is the
 * synthetic fallback for guards that are `nameGuard`'d but carry no
 * `description`.
 *
 * Tooling MUST tolerate unknown `kind` values per ADR-105 rule 1; the
 * `unknown` entry below is the catch-all renderers fall back to.
 *
 * Used by:
 *   - `apps/web/src/sections/GuardMetadataGraph.tsx` (the radial graph)
 *   - `apps/web/src/sections/playground/PackInspector.tsx` (per-tab Pack inspector)
 */

export const GUARD_KIND_INFO: Record<
  string,
  { fill: string; label: string; oneLiner: string }
> = {
  threshold: {
    fill: "fill-defer stroke-defer",
    label: "threshold",
    oneLiner: "Numeric threshold (refund cap, ramp%, etc.)",
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

export function guardKindInfo(kind: string | undefined) {
  return GUARD_KIND_INFO[kind ?? "unknown"] ?? GUARD_KIND_INFO.unknown!;
}
