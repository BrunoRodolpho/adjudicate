import type { Metadata } from "next";
import {
  projectDriftTransparency,
  type DriftSeverityBand,
} from "@/lib/drift-transparency";
import { DRIFT_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { TransparencyLayout } from "@/components/transparency/TransparencyLayout";
import { TransparencyMetric } from "@/components/transparency/TransparencyMetric";

export const metadata: Metadata = {
  title: "Behavioral drift · Transparency · adjudicate",
  description:
    "Public, read-only behavioral-drift status for the reference packs: whether decision distributions are shifting, by severity band and top dimension. Aggregates only — no category maps, raw TVD numbers, or underlying records.",
};

const AS_OF = "2026-06-07T00:00:00.000Z";

const SEVERITY_LABEL: Record<DriftSeverityBand, string> = {
  ok: "OK",
  elevated: "Elevated",
  high: "High",
};
const SEVERITY_METRIC_TONE: Record<DriftSeverityBand, "ok" | "warn" | "crit"> = {
  ok: "ok",
  elevated: "warn",
  high: "crit",
};
const DIMENSION_LABEL: Record<string, string> = {
  "decision.kind": "decision kind",
  "intent.kind": "intent kind",
  basis: "basis",
};

/**
 * /transparency/drift — public, read-only behavioral-drift status (ADR-132).
 * Aggregate-only, banded projection: a coarse severity band + active-alert count
 * + the top dimension NAME — never a category map, raw TVD, or timeline.
 */
export default function DriftTransparencyPage() {
  const status = projectDriftTransparency(DRIFT_TRANSPARENCY_SAMPLE, AS_OF);
  const healthy = status.severity === "ok";

  return (
    <TransparencyLayout
      slug="drift"
      eyebrow="behavioral drift"
      title="Are decisions drifting?"
      lead="Whether the agent's decision distributions are shifting — a sudden refusal spike, a never-seen intent kind — published as a sanitized status. No category maps, raw distance numbers, or underlying records ever cross this boundary."
      hero={
        <TransparencyMetric
          label="Active drift alerts"
          value={String(status.activeAlerts)}
          unit={status.activeAlerts === 1 ? "alert" : "alerts"}
          tone={SEVERITY_METRIC_TONE[status.severity]}
          status={`Severity · ${SEVERITY_LABEL[status.severity]}`}
          detail={
            healthy
              ? "Decision distributions match their established baseline — monitoring is active."
              : "Decision distributions are shifting away from their baseline."
          }
        >
          {status.topDimension ? (
            <div role="status" aria-label={`Drift severity ${SEVERITY_LABEL[status.severity]}, ${status.activeAlerts} active alerts, top dimension ${DIMENSION_LABEL[status.topDimension] ?? status.topDimension}`}>
              <p className="text-eyebrow uppercase text-muted">Top dimension</p>
              <span
                data-testid="drift-top-dimension"
                className="mt-3 inline-flex rounded-full border border-edge bg-canvas px-2.5 py-0.5 text-body-sm text-ink"
              >
                {DIMENSION_LABEL[status.topDimension] ?? status.topDimension}
              </span>
              <span data-testid="drift-severity" className="sr-only">
                {SEVERITY_LABEL[status.severity]}
              </span>
            </div>
          ) : null}
        </TransparencyMetric>
      }
      shows={
        <p>
          <strong>Behavioral drift</strong> means the agent&apos;s decisions are
          shifting away from their expected pattern — more refusals, a never-seen
          intent kind. That usually signals a model update, a new pack version,
          or a real governance problem. The <strong>severity band</strong> tells
          you how urgent it is; if you ever see <strong>High</strong>, compare
          the recent decision distribution against the baseline in the operator
          console before shipping anything new.
        </p>
      }
      notShown={
        <p>
          The operator console shows per-dimension{" "}
          <strong>total-variation distances, the baseline-vs-recent category
          maps</strong>, the full alert list, and a <strong>drift timeline</strong>.
          None of that is published here — this status is built field-by-field
          from an allowlist that carries only a coarse severity band, an alert
          count, and a single dimension name.
        </p>
      }
      footnote={
        <>
          As of <time dateTime={status.asOf}>{status.asOf.slice(0, 10)}</time> ·
          aggregates only · illustrative sample data.
        </>
      }
    />
  );
}
