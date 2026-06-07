import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import { Footer } from "@/sections/FinalCTA";
import {
  projectIntegrityTransparency,
  type PublicIntegrityBadge,
} from "@/lib/integrity-transparency";
import {
  CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
  type KillSwitchStabilityClass,
} from "@/lib/transparency-fixtures";

export const metadata: Metadata = {
  title: "Configuration integrity · Transparency · adjudicate",
  description:
    "Public, read-only configuration-integrity badge for the reference packs: whether pack configuration seals verify and the kill-switch stability class. Aggregates only — no digests, reasons, or actors.",
};

/**
 * /transparency/integrity — public, read-only configuration-integrity badge
 * (ADR-131).
 *
 * Server component. apps/web is public and has no kernel runtime, so this
 * renders from a committed ILLUSTRATIVE fixture projected through the
 * AGGREGATE-ONLY `projectIntegrityTransparency`. The projection exposes only
 * seal-verified counts + a closed kill-switch stability class — NEVER a digest,
 * a seal reason, an operator/actor, a headline, or a per-pack detail (all
 * operator-only on the console). All values render as inert text.
 */

// Illustrative freshness stamp. A real deployment computes `asOf` server-side
// from the live aggregate; the committed fixture pins it for determinism.
const AS_OF = "2026-06-07T00:00:00.000Z";

const STABILITY_LABEL: Record<KillSwitchStabilityClass, string> = {
  stable: "Stable",
  single_incident: "Single incident",
  recurring_incidents: "Recurring incidents",
  storm: "Storm",
};

const STABILITY_TONE: Record<KillSwitchStabilityClass, string> = {
  stable: "border-emerald-500/40 text-emerald-300",
  single_incident: "border-amber-500/40 text-amber-300",
  recurring_incidents: "border-orange-500/40 text-orange-300",
  storm: "border-red-500/50 text-red-300",
};

export default function ConfigIntegrityTransparencyPage() {
  const badge = projectIntegrityTransparency(
    CONFIG_INTEGRITY_TRANSPARENCY_SAMPLE,
    AS_OF,
  );

  return (
    <main>
      <header className="bg-canvas pb-6 pt-10">
        <div className="mx-auto max-w-6xl px-6">
          <Link
            href="/transparency"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-section text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> Back to transparency
          </Link>
          <p className="mt-6 text-xs uppercase tracking-section text-muted">
            Public · transparency · configuration integrity
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            Is the configuration intact?
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Whether each reference pack&apos;s configuration seal still verifies,
            and how stable the emergency kill switch has been — published as a
            sanitized badge. No digests, seal reasons, operators, or incident
            detail ever cross this boundary.
          </p>
        </div>
      </header>

      <section aria-labelledby="badge-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="badge-heading" className="sr-only">
            Configuration-integrity status
          </h2>

          <div
            role="status"
            aria-label={badgeAriaLabel(badge)}
            data-testid="integrity-badge"
            className="max-w-2xl rounded-sm border border-edge bg-surface p-5"
          >
            {/* Seal indicator. */}
            <div className="flex items-center gap-3">
              {badge.allSealsVerified ? (
                <ShieldCheck
                  size={28}
                  aria-hidden
                  className="shrink-0 text-emerald-400"
                />
              ) : (
                <ShieldAlert
                  size={28}
                  aria-hidden
                  className="shrink-0 text-amber-400"
                />
              )}
              <div className="flex flex-col">
                <span className="text-base font-semibold text-ink">
                  {badge.allSealsVerified
                    ? "All packs sealed & verified"
                    : "Integrity check pending"}
                </span>
                <span className="text-sm text-muted">
                  {badge.packsSealed} of {badge.packsTotal} reference packs verify
                </span>
              </div>
            </div>

            {/* Kill-switch stability pill. */}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-4">
              <span className="text-xs uppercase tracking-section text-muted">
                Kill-switch stability
              </span>
              <span
                data-testid="integrity-stability"
                className={`rounded-sm border px-2 py-0.5 text-xs uppercase tracking-section ${
                  STABILITY_TONE[badge.killSwitchStability]
                }`}
              >
                {STABILITY_LABEL[badge.killSwitchStability]}
              </span>
            </div>

            <p className="mt-4 text-xs text-faint">
              As of{" "}
              <time dateTime={badge.asOf}>{badge.asOf.slice(0, 10)}</time> ·
              aggregates only · illustrative sample data.
            </p>
          </div>

          <div className="mt-6 max-w-2xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              What this does not show
            </p>
            <p className="mt-2 text-sm text-muted">
              The operator console shows per-pack{" "}
              <span className="text-ink">configuration digests, seal errors,
              signature detail</span>, and the full kill-switch event log with{" "}
              <span className="text-ink">reasons and operator identities</span>.
              None of that is published here — this badge is built field-by-field
              from an allowlist that carries only counts and a closed stability
              class.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/** Color-independent accessible label for the badge `role="status"`. */
function badgeAriaLabel(badge: PublicIntegrityBadge): string {
  const seals = badge.allSealsVerified
    ? `All ${badge.packsTotal} packs sealed and verified`
    : `${badge.packsSealed} of ${badge.packsTotal} packs verified`;
  return `Configuration integrity: ${seals}. Kill-switch stability: ${
    STABILITY_LABEL[badge.killSwitchStability]
  }.`;
}
