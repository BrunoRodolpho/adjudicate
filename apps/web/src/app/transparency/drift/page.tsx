import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Activity, TrendingUp } from "lucide-react";
import {
  projectDriftTransparency,
  type DriftSeverityBand,
  type PublicDriftStatus,
} from "@/lib/drift-transparency";
import { DRIFT_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";

export const metadata: Metadata = {
  title: "Behavioral drift · Transparency · adjudicate",
  description:
    "Public, read-only behavioral-drift status for the reference packs: whether decision distributions are shifting, by severity band and top dimension. Aggregates only — no category maps, raw TVD numbers, or underlying records.",
};

/**
 * /transparency/drift — public, read-only behavioral-drift status (ADR-132).
 *
 * Server component. apps/web is public and has no kernel runtime, so this
 * renders from a committed ILLUSTRATIVE fixture projected through the
 * AGGREGATE-ONLY, BANDED `projectDriftTransparency`. The projection exposes only
 * a coarse severity band + an active-alert count + the top dimension NAME —
 * NEVER a category map, a raw TVD number, a baseline/recent count, an overflow
 * bucket, or a timeline entry (all operator-only on the console). All values
 * render as inert text.
 */

// Illustrative freshness stamp. A real deployment computes `asOf` server-side
// from the live aggregate; the committed fixture pins it for determinism.
const AS_OF = "2026-06-07T00:00:00.000Z";

const SEVERITY_LABEL: Record<DriftSeverityBand, string> = {
  ok: "OK",
  elevated: "Elevated",
  high: "High",
};

const SEVERITY_TONE: Record<DriftSeverityBand, string> = {
  ok: "border-emerald-500/40 text-emerald-300",
  elevated: "border-amber-500/40 text-amber-300",
  high: "border-red-500/50 text-red-300",
};

const DIMENSION_LABEL: Record<string, string> = {
  "decision.kind": "decision kind",
  "intent.kind": "intent kind",
  basis: "basis",
};

export default function DriftTransparencyPage() {
  const status = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
  const healthy = status.severity === "ok";

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
            Public · transparency · behavioral drift
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            Are decisions drifting?
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Whether the agent&apos;s decision distributions are shifting — a
            sudden refusal spike, a never-seen intent kind — published as a
            sanitized status. No category maps, raw distance numbers, or
            underlying records ever cross this boundary.
          </p>
        </div>
      </header>

      <section aria-labelledby="status-heading" className="bg-canvas pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 id="status-heading" className="sr-only">
            Behavioral-drift status
          </h2>

          <div
            role="status"
            aria-label={statusAriaLabel(status)}
            data-testid="drift-badge"
            className="max-w-2xl rounded-sm border border-edge bg-surface p-5"
          >
            {/* Drift indicator. */}
            <div className="flex items-center gap-3">
              {healthy ? (
                <Activity
                  size={28}
                  aria-hidden
                  className="shrink-0 text-emerald-400"
                />
              ) : (
                <TrendingUp
                  size={28}
                  aria-hidden
                  className="shrink-0 text-amber-400"
                />
              )}
              <div className="flex flex-col">
                <span className="text-base font-semibold text-ink">
                  {healthy
                    ? "Drift monitoring active — no alerts"
                    : "Decision distributions are shifting"}
                </span>
                <span className="text-sm text-muted">
                  {status.activeAlerts} active drift{" "}
                  {status.activeAlerts === 1 ? "alert" : "alerts"}
                </span>
              </div>
            </div>

            {/* Severity band + top dimension. */}
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-edge pt-4">
              <span className="text-xs uppercase tracking-section text-muted">
                Severity
              </span>
              <span
                data-testid="drift-severity"
                className={`rounded-sm border px-2 py-0.5 text-xs uppercase tracking-section ${
                  SEVERITY_TONE[status.severity]
                }`}
              >
                {SEVERITY_LABEL[status.severity]}
              </span>
              {status.topDimension ? (
                <>
                  <span className="text-xs uppercase tracking-section text-muted">
                    Top dimension
                  </span>
                  <span
                    data-testid="drift-top-dimension"
                    className="rounded-sm border border-edge px-2 py-0.5 text-xs text-ink"
                  >
                    {DIMENSION_LABEL[status.topDimension] ?? status.topDimension}
                  </span>
                </>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-faint">
              As of{" "}
              <time dateTime={status.asOf}>{status.asOf.slice(0, 10)}</time> ·
              aggregates only · illustrative sample data.
            </p>
          </div>

          <div className="mt-6 max-w-2xl rounded-sm border border-edge bg-surface p-4">
            <p className="text-xs uppercase tracking-section text-muted">
              What this does not show
            </p>
            <p className="mt-2 text-sm text-muted">
              The operator console shows per-dimension{" "}
              <span className="text-ink">total-variation distances, the
              baseline-vs-recent category maps</span>, the full alert list, and a{" "}
              <span className="text-ink">drift timeline</span>. None of that is
              published here — this status is built field-by-field from an
              allowlist that carries only a coarse severity band, an alert count,
              and a single dimension name.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Color-independent accessible label for the badge `role="status"`. */
function statusAriaLabel(status: PublicDriftStatus): string {
  const top = status.topDimension
    ? `, top dimension ${DIMENSION_LABEL[status.topDimension] ?? status.topDimension}`
    : "";
  return `Drift status: ${SEVERITY_LABEL[status.severity]}, ${
    status.activeAlerts
  } active ${status.activeAlerts === 1 ? "alert" : "alerts"}${top}.`;
}
