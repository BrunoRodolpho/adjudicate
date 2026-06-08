import type { Decision, DecisionBasis } from "@adjudicate/core";
import { runPlayground } from "@/lib/kernel-runner";
import {
  projectRedTeamDefenses,
  type PublicRedTeamDefense,
} from "@/lib/red-team-transparency";
import { projectDriftTransparency } from "@/lib/drift-transparency";
import {
  RED_TEAM_TRANSPARENCY_SAMPLE,
  DRIFT_TRANSPARENCY_SAMPLE,
} from "@/lib/transparency-fixtures";
import type {
  CapabilityContent,
  WorkedExample as WorkedExampleSpec,
} from "@/content/capabilities";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Callout } from "@/components/ui/Callout";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import {
  BarDistribution,
  TimelineChart,
  type SeriesPoint,
  type TimePoint,
} from "@/components/console-kit/charts";

/**
 * WorkedExample — the per-capability "show, don't tell" panel.
 *
 * SERVER component. It dispatches on `capability.workedExample.kind`:
 *
 *   • live-kernel — runs the REAL kernel server-side via `runPlayground`
 *     (build/render-time) and renders the genuine decision. For PII /
 *     token-budget / release-gating that is a full `<ReceiptCard>`. For
 *     command-risk it is a FOCUSED custom summary — DecisionChip + risk
 *     category + basis codes ONLY. The raw command is NEVER rendered: the
 *     ReceiptCard would surface the envelope payload, the REQUEST_CONFIRMATION
 *     prompt, and the basis `detail` (all of which carry the command string),
 *     so command-risk deliberately does NOT use ReceiptCard.
 *
 *   • chart — embeds the matching console-kit chart fed by the PUBLIC
 *     transparency projection (aggregate-only), wrapped in ConsoleChrome so the
 *     standing "illustrative · sample data" honesty label is always present.
 *
 *   • receipt — a representative ReceiptCard (none of the Tier-1 set use this;
 *     kept for completeness so the dispatch is total).
 */

export async function WorkedExample({
  capability,
}: {
  readonly capability: CapabilityContent;
}) {
  const spec = capability.workedExample;
  switch (spec.kind) {
    case "live-kernel":
      return <LiveKernelExample capability={capability} spec={spec} />;
    case "chart":
      return <ChartExample capability={capability} spec={spec} />;
    case "receipt":
      return <ReceiptOnlyExample capability={capability} />;
  }
}

/* ── live-kernel ───────────────────────────────────────────────────────── */

async function LiveKernelExample({
  capability,
  spec,
}: {
  readonly capability: CapabilityContent;
  readonly spec: Extract<WorkedExampleSpec, { kind: "live-kernel" }>;
}) {
  const result = await runPlayground({
    intentKind: spec.intentKind,
    payload: spec.payload,
    state: spec.state,
  });

  // Command-risk is the non-negotiable invariant: the raw command must NEVER
  // be rendered. The ReceiptCard would echo the envelope payload, the
  // REQUEST_CONFIRMATION prompt, and the basis `detail` — all carry the
  // command — so we render a focused, command-free summary instead.
  if (capability.slug === "command-risk-guard") {
    return <CommandRiskSummary decision={result.decision} />;
  }

  // PII / token-budget / release-gating: the full receipt is safe and is the
  // point — it shows the real REWRITE diff / REFUSE / clamp the kernel made.
  return (
    <div className="flex flex-col gap-3">
      <RealKernelLabel />
      <ReceiptCard result={result} variant="full" />
    </div>
  );
}

/**
 * CommandRiskSummary — the ONLY rendering of a command-risk decision. It shows
 * the DECISION, the risk CATEGORY (a closed enum: destructive / network /
 * credential), and the BASIS CODES — never the command string, never the basis
 * `detail` object (which carries the command), never the REQUEST_CONFIRMATION
 * prompt (which interpolates the command).
 */
function CommandRiskSummary({ decision }: { readonly decision: Decision }) {
  const riskCategory = extractRiskCategory(decision.basis);
  // Basis category:code pairs are safe vocabulary; we deliberately drop every
  // basis `detail` (it embeds the command).
  const codes = decision.basis.map((b) => `${b.category}:${b.code}`);

  return (
    <div className="flex flex-col gap-3">
      <RealKernelLabel />
      <div className="overflow-hidden rounded-2xl border border-edge bg-surface shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <DecisionChip kind={decision.kind} size="md" />
          <span className="font-mono text-[10px] uppercase tracking-section text-faint">
            command-risk · summary
          </span>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-section text-faint">
              risk category:
            </span>
            <span className="rounded-md border border-escalate/30 bg-escalate/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-section text-escalate">
              {riskCategory ?? "unclassified"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-section text-faint">
              basis · {codes.length}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <li key={code}>
                  <code className="rounded-md border border-edge bg-canvas px-2 py-0.5 font-mono text-[11px] text-ink/85">
                    {code}
                  </code>
                </li>
              ))}
            </ul>
          </div>

          <Callout tone="warn" title="Command text is never rendered">
            By policy (ADR-123) the raw command, the basis detail, and the
            confirmation prompt are withheld from every surface. The kernel
            still made a real, audited decision — this summary reports the
            outcome by <span className="text-ink">category</span> and{" "}
            <span className="text-ink">basis</span> alone.
          </Callout>
        </div>
      </div>
    </div>
  );
}

/**
 * Read the closed-enum risk category off the basis `detail.category` without
 * surfacing any other detail field. Returns null if absent (e.g. a safe path).
 */
function extractRiskCategory(
  basis: ReadonlyArray<DecisionBasis>,
): string | null {
  for (const b of basis) {
    const detail = "detail" in b ? (b.detail as unknown) : undefined;
    if (detail && typeof detail === "object" && "category" in detail) {
      const c = (detail as { category?: unknown }).category;
      if (typeof c === "string") return c;
    }
  }
  return null;
}

function RealKernelLabel() {
  return (
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-section text-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-execute" />
      Real kernel · run server-side at render time
    </p>
  );
}

/* ── chart ─────────────────────────────────────────────────────────────── */

function ChartExample({
  capability,
  spec,
}: {
  readonly capability: CapabilityContent;
  readonly spec: Extract<WorkedExampleSpec, { kind: "chart" }>;
}) {
  if (capability.slug === "red-team") {
    return <RedTeamChart transparencyHref={spec.transparencyHref} />;
  }
  if (capability.slug === "behavioral-drift") {
    return <DriftChart transparencyHref={spec.transparencyHref} />;
  }
  // Any other chart capability: a neutral link-out (Tier-1 only has the two).
  return (
    <Callout tone="info">
      The worked example for this capability lives on its public transparency
      view.
    </Callout>
  );
}

/**
 * Red Team — BarDistribution of "scenarios defended" per shipped pack, fed by
 * the AGGREGATE-ONLY public projection (counts only; never a scenario name or
 * basis code). Wrapped in ConsoleChrome (dark surface the console-kit tokens
 * expect + standing honesty label).
 */
function RedTeamChart({ transparencyHref }: { readonly transparencyHref: string }) {
  const defenses = projectRedTeamDefenses(RED_TEAM_TRANSPARENCY_SAMPLE);
  const data: SeriesPoint[] = defenses.map((d) => ({
    label: d.displayName,
    value: d.defended,
  }));
  const scaleMax = defenses.reduce((m, d) => Math.max(m, d.total), 1);

  return (
    <div className="flex flex-col gap-3">
      <ConsoleChrome caption="red-team · defenses (sample)">
        <div className="flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-section text-console-faint">
            Adversarial scenarios defended · per shipped pack · illustrative
            sample data
          </p>
          <BarDistribution
            data={data}
            title="Scenarios defended per pack"
            max={scaleMax}
          />
          <ul className="flex flex-wrap gap-2">
            {defenses.map((d) => (
              <RedTeamStatusPill key={d.packId} defense={d} />
            ))}
          </ul>
        </div>
      </ConsoleChrome>
      <PublicDataLink href={transparencyHref} label="red-team defenses" />
    </div>
  );
}

function RedTeamStatusPill({ defense }: { readonly defense: PublicRedTeamDefense }) {
  const clean = defense.lastRunStatus === "clean";
  return (
    <li
      className={`rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-section ${
        clean
          ? "border-emerald-500/40 text-emerald-300"
          : "border-red-500/50 text-red-300"
      }`}
    >
      {defense.displayName}: {clean ? "clean" : "regressed"}
    </li>
  );
}

/**
 * Behavioral drift — TimelineChart of an ILLUSTRATIVE per-bucket drift-distance
 * sparkline. The public projection is aggregate-only (a coarse band + alert
 * count + top dimension); the timeline series here is a labelled illustrative
 * trend, banded by the public severity so the tint matches the real status.
 */
function DriftChart({ transparencyHref }: { readonly transparencyHref: string }) {
  const status = projectDriftTransparency(
    DRIFT_TRANSPARENCY_SAMPLE,
    "2026-06-07T00:00:00.000Z",
  );
  // Illustrative sparkline — a deterministic series, not live TVD numbers. The
  // band follows the public severity so the chart tint reads consistently.
  const points: readonly TimePoint[] = ILLUSTRATIVE_DRIFT_SERIES;
  const band = status.severity === "high" ? "crit" : status.severity === "elevated" ? "warn" : "ok";

  return (
    <div className="flex flex-col gap-3">
      <ConsoleChrome caption="drift · distance trend (sample)">
        <div className="flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-section text-console-faint">
            Decision-distribution drift over time · illustrative sample data
          </p>
          <TimelineChart
            points={points}
            title="Drift distance over time"
            band={band}
            yFormat={(n) => n.toFixed(2)}
          />
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-section text-console-faint">
            <span>Severity</span>
            <span className="rounded-sm border border-console-edge px-2 py-0.5 text-console-ink">
              {status.severity}
            </span>
            <span>Active alerts</span>
            <span className="rounded-sm border border-console-edge px-2 py-0.5 text-console-ink tabular-nums">
              {status.activeAlerts}
            </span>
            {status.topDimension ? (
              <>
                <span>Top dimension</span>
                <span className="rounded-sm border border-console-edge px-2 py-0.5 text-console-ink">
                  {status.topDimension}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </ConsoleChrome>
      <PublicDataLink href={transparencyHref} label="behavioral drift" />
    </div>
  );
}

/**
 * Illustrative drift-distance series. Deterministic literals — NOT live TVD
 * numbers (those are operator-only). The shape (a rising-then-elevated tail)
 * matches the fixture's "elevated" public band.
 */
const ILLUSTRATIVE_DRIFT_SERIES: readonly TimePoint[] = [
  { t: "T-6", value: 0.06 },
  { t: "T-5", value: 0.08 },
  { t: "T-4", value: 0.07 },
  { t: "T-3", value: 0.12 },
  { t: "T-2", value: 0.19 },
  { t: "T-1", value: 0.27 },
  { t: "T-0", value: 0.31 },
];

/* ── receipt ───────────────────────────────────────────────────────────── */

function ReceiptOnlyExample({
  capability,
}: {
  readonly capability: CapabilityContent;
}) {
  // No Tier-1 capability uses the bare "receipt" kind; this keeps the dispatch
  // total and degrades gracefully if a future Tier-1 entry opts into it.
  return (
    <Callout tone="info">
      A representative receipt for{" "}
      <span className="text-ink">{capability.name}</span> is documented on its
      reference entry.
    </Callout>
  );
}

/* ── shared ────────────────────────────────────────────────────────────── */

function PublicDataLink({
  href,
  label,
}: {
  readonly href: string;
  readonly label: string;
}) {
  return (
    <p className="text-xs text-muted">
      Source projection ·{" "}
      <a
        href={href}
        className="font-medium text-ink underline decoration-edge underline-offset-2 transition-colors hover:decoration-ink"
      >
        public {label} view
      </a>{" "}
      — aggregate-only, illustrative sample data.
    </p>
  );
}
