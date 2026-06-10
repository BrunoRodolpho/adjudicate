import type { Metadata } from "next";
import { projectIntegrityTransparency } from "@/lib/integrity-transparency";
import {
  CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
  type KillSwitchStabilityClass,
} from "@/lib/transparency-fixtures";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";
import { TransparencyMetric } from "@/components/transparency/TransparencyMetric";

export const metadata: Metadata = {
  title: "Configuration integrity · Transparency · adjudicate",
  description:
    "Public, read-only configuration-integrity badge for the reference packs: whether pack configuration seals verify and the kill-switch stability class. Aggregates only — no digests, reasons, or actors.",
};

// Illustrative freshness stamp. A real deployment computes `asOf` server-side
// from the live aggregate; the committed fixture pins it for determinism.
const AS_OF = "2026-06-07T00:00:00.000Z";

const STABILITY_LABEL: Record<KillSwitchStabilityClass, string> = {
  stable: "Stable",
  single_incident: "Single incident",
  recurring_incidents: "Recurring incidents",
  storm: "Storm",
};

/** Least-concerning → most-concerning, for the state-transition strip. */
const STABILITY_ORDER: readonly KillSwitchStabilityClass[] = [
  "stable",
  "single_incident",
  "recurring_incidents",
  "storm",
];

const STABILITY_TONE: Record<KillSwitchStabilityClass, string> = {
  stable: "border-execute/50 bg-execute/10 text-execute-strong",
  single_incident: "border-defer/50 bg-defer/10 text-defer-strong",
  recurring_incidents: "border-rewrite/50 bg-rewrite/10 text-rewrite-strong",
  storm: "border-refuse/50 bg-refuse/10 text-refuse-strong",
};

/**
 * /transparency/integrity — public, read-only configuration-integrity badge
 * (ADR-131). Aggregate-only projection over a committed illustrative fixture —
 * NEVER a digest, seal reason, operator, or per-pack detail.
 */
export default function ConfigIntegrityTransparencyPage() {
  const badge = projectIntegrityTransparency(
    CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
    AS_OF,
  );

  return (
    <TransparencyLayout
      slug="integrity"
      eyebrow="configuration integrity"
      title="Is the configuration intact?"
      lead="Whether each reference pack's configuration seal still verifies, and how stable the emergency kill switch has been — published as a sanitized badge. No digests, seal reasons, operators, or incident detail ever cross this boundary."
      hero={
        <TransparencyMetric
          label="Packs sealed & verified"
          value={`${badge.packsSealed}/${badge.packsTotal}`}
          unit="sealed"
          tone={badge.allSealsVerified ? "ok" : "warn"}
          detail={
            badge.allSealsVerified
              ? "Every reference pack's configuration seal still verifies cryptographically."
              : "One or more reference packs have a seal that no longer verifies."
          }
        >
          <div
            role="status"
            aria-label={badgeAriaLabel(badge)}
            data-testid="integrity-badge"
          >
            <p className="text-eyebrow uppercase text-muted">
              Kill-switch stability
            </p>
            <ol
              aria-label="Kill-switch stability classes, from least to most concerning"
              className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-section"
            >
              {STABILITY_ORDER.map((cls, i) => {
                const isCurrent = cls === badge.killSwitchStability;
                return (
                  <li key={cls} className="flex items-center gap-1.5">
                    <span
                      data-testid={
                        isCurrent ? "integrity-stability" : undefined
                      }
                      className={
                        isCurrent
                          ? `rounded-full border px-2 py-0.5 ${STABILITY_TONE[cls]}`
                          : "rounded-full border border-edge px-2 py-0.5 text-muted"
                      }
                    >
                      {STABILITY_LABEL[cls]}
                      {isCurrent ? <span className="sr-only"> (current)</span> : null}
                    </span>
                    {i < STABILITY_ORDER.length - 1 ? (
                      <span aria-hidden className="text-faint">
                        →
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </TransparencyMetric>
      }
      shows={
        <p>
          Each pack&apos;s configuration is{" "}
          <strong>cryptographically sealed</strong> — a digest proves nothing has
          changed since deployment. If a seal stops verifying, the config was
          altered out-of-band and the kernel can no longer trust it. Separately,
          the <strong>kill-switch stability class</strong> tracks how often the
          emergency stop has been pulled. Together they read governance health:
          is the policy intact, and is the system calm?
        </p>
      }
      notShown={
        <p>
          The operator console shows per-pack{" "}
          <strong>configuration digests, seal errors, signature detail</strong>,
          and the full kill-switch event log with{" "}
          <strong>reasons and operator identities</strong>. None of that is
          published here — this badge is built field-by-field from an allowlist
          that carries only counts and a closed stability class.
        </p>
      }
      footnote={
        <>
          As of{" "}
          <time dateTime={badge.asOf}>{badge.asOf.slice(0, 10)}</time> ·
          aggregates only · illustrative sample data.
        </>
      }
    />
  );
}

/** Color-independent accessible label for the badge `role="status"`. */
function badgeAriaLabel(badge: {
  allSealsVerified: boolean;
  packsTotal: number;
  packsSealed: number;
  killSwitchStability: KillSwitchStabilityClass;
}): string {
  const seals = badge.allSealsVerified
    ? `All ${badge.packsTotal} packs sealed and verified`
    : `${badge.packsSealed} of ${badge.packsTotal} packs verified`;
  return `Configuration integrity: ${seals}. Kill-switch stability: ${
    STABILITY_LABEL[badge.killSwitchStability]
  }.`;
}
