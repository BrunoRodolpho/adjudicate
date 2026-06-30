import { Callout } from "@/components/ui/Callout";

/**
 * ClaimsRuntimeRoadmap — four designed/built claims-runtime mechanisms on the
 * v1.8 kernel line, surfaced on the architecture page.
 *
 * HONESTY CONTRACT (marketing-audit §4): every mechanism here rides on the
 * unpublished core 1.8.0 / claims-runtime surface and the Track-A pipeline is
 * flag-OFF / inert on the current dev model. They are presented strictly as
 * designed/built, forthcoming hardening shipping in the v1.8 line — NEVER as
 * live behaviour on the current model — and deliberately avoid the banned
 * over-claim verbs (sole-emitter, ledger-derived/sourced, proven, absolute).
 * The per-card "v1.8 line" badge and the closing warn Callout make the
 * forthcoming framing unmissable.
 *
 * Each card maps to the real kernel source file so a reader can follow the
 * claim straight into the repo, matching the DataFlowDiagram convention.
 */

interface Mechanism {
  /** Kernel identifier(s) for the mechanism, rendered mono. */
  readonly term: string;
  readonly title: string;
  readonly body: string;
  readonly source: string;
}

const MECHANISMS: readonly Mechanism[] = [
  {
    term: "RenderedReply · CanonicalClaim",
    title: "Non-forgeable, kernel-minted reply & claim brands",
    body: "A runtime-non-forgeable, kernel-minted reply type. A raw string cannot reach a typed transport (a compile error) and is rejected at the egress sink (at runtime). The renderer only accepts a kernel-minted claim object produced after validation and consistency checks.",
    source: "@adjudicate/core · rendered-reply.ts · claims/canonical-claim.ts",
  },
  {
    term: "over-claim value-check",
    title: "Rendered values are checked against their evidence",
    body: "A rendered value that contradicts its licensing evidence is refused — an over-claim guard.",
    source: "@adjudicate/core · claims/soundness.ts",
  },
  {
    term: "ClaimDefinition validator",
    title: "Fail-closed definition validation at load time",
    body: "Claim definitions are validated fail-closed at load time — an incomplete or inconsistent definition is rejected before it can run.",
    source: "@adjudicate/core · claims/claim-definition.ts",
  },
  {
    term: "registry-diff lint",
    title: "Soundness-monotone extensibility",
    body: "A registry change that relaxes a declared claim type or constraint is a build error — the registry diff is machine-checked to be soundness-monotone (additions tighten what validates; they cannot loosen it).",
    source: "@adjudicate/core · claims/registry-diff.ts",
  },
];

export function ClaimsRuntimeRoadmap({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <div className={className}>
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        {MECHANISMS.map((m) => (
          <div
            key={m.term}
            className="flex h-full flex-col rounded-xl border border-console-edge bg-console-panel p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <code className="text-[11px] leading-snug text-brand-ink">
                {m.term}
              </code>
              <span className="shrink-0 rounded-full border border-defer/40 bg-defer/5 px-2 py-0.5 text-[10px] uppercase tracking-section text-defer">
                v1.8 line
              </span>
            </div>
            <h3 className="mt-3 text-sm font-semibold leading-tight text-console-ink">
              {m.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-console-muted">
              {m.body}
            </p>
            <code className="mt-auto block pt-4 text-[10.5px] leading-snug text-console-muted">
              {m.source}
            </code>
          </div>
        ))}
      </div>

      <Callout
        tone="warn"
        title="Designed and built — forthcoming on the v1.8 line"
        className="mt-6"
      >
        These four mechanisms are part of the v1.8 kernel surface and are listed
        here as forthcoming hardening. The v1.8 line is not yet published, and
        the claims pipeline is flag-off — not yet live behaviour on the current
        model.
      </Callout>
    </div>
  );
}
