import { Fragment } from "react";
import { ArrowRight, ArrowUpRight, FileCode2, ScanSearch, ListChecks } from "lucide-react";
import type { AuditRecord, Decision, DecisionBasis } from "@adjudicate/core";
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
import { CONSOLE_REPLICA_RECORDS_BY_HASH } from "@/lib/console-replica-records";
import type {
  CapabilityContent,
  WorkedExample as WorkedExampleSpec,
} from "@/content/capabilities";
import { ReceiptCard } from "@/components/receipt/ReceiptCard";
import { DecisionChip } from "@/components/ui/DecisionChip";
import { Callout } from "@/components/ui/Callout";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { cn } from "@/lib/cn";
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
 *   • receipt — a REAL committed AuditRecord (resolved from the console-replica
 *     fixtures by `recordHash`) rendered as a full ReceiptCard. When the record
 *     carries v5 `metadata.hallucination_score`, a groundedness badge is shown
 *     above it — the same pattern as the /console decision replica.
 *
 *   • replica — a prominent "see it live in the operator console" panel (dark,
 *     console aesthetic) linking the featured /console replica route.
 *
 *   • pack — a card listing a governance pack's declared governed intents +
 *     the outcome chips its policies produce + the illustrative note.
 *
 *   • illustration — a titled explainer card (body prose + optional outcome
 *     chips) for design-time / upstream-only capabilities with no replica.
 *
 * Every Tier-2 (fixture-illustrative) variant carries a visible "illustrative"
 * label, per the no-fake-live-data invariant.
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
      return <ReceiptExample spec={spec} />;
    case "replica":
      return <ReplicaExample capability={capability} spec={spec} />;
    case "pack":
      return <PackExample spec={spec} />;
    case "illustration":
      return <IllustrationExample capability={capability} spec={spec} />;
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
      <div className="overflow-hidden rounded-2xl border border-console-edge bg-console-panel">
        <header className="flex items-center justify-between gap-3 border-b border-console-edge px-4 py-3">
          <DecisionChip kind={decision.kind} size="md" />
          <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
            command-risk · summary
          </span>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
              risk category:
            </span>
            <span className="rounded-md border border-escalate/30 bg-escalate/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-section text-escalate">
              {riskCategory ?? "unclassified"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
              basis · {codes.length}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <li key={code}>
                  <code className="rounded-md border border-console-edge bg-console-canvas px-2 py-0.5 font-mono text-[11px] text-console-ink">
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
            outcome by <span className="text-console-ink">category</span> and{" "}
            <span className="text-console-ink">basis</span> alone.
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
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-section text-console-muted">
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
          <p className="text-[10px] uppercase tracking-section text-console-muted">
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
          <p className="text-[10px] uppercase tracking-section text-console-muted">
            Decision-distribution drift over time · illustrative sample data
          </p>
          <TimelineChart
            points={points}
            title="Drift distance over time"
            band={band}
            yFormat={(n) => n.toFixed(2)}
          />
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-section text-console-muted">
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

/**
 * receipt — a REAL committed AuditRecord (looked up by `recordHash` from the
 * console-replica fixtures) rendered as a full ReceiptCard. For
 * hallucination-scoring the resolved record carries v5
 * `metadata.hallucination_score`, so we render the groundedness badge above the
 * card — exactly the pattern the /console decision replica uses — to make the
 * "the signal rode alongside the audited decision without moving it" point
 * visible. A dead hash (registry test forbids it) degrades to a Callout.
 */
function ReceiptExample({
  spec,
}: {
  readonly spec: Extract<WorkedExampleSpec, { kind: "receipt" }>;
}) {
  const record = CONSOLE_REPLICA_RECORDS_BY_HASH.get(spec.recordHash);
  if (!record) {
    return (
      <Callout tone="warn" title="Sample record unavailable">
        The referenced illustrative record could not be resolved. The package
        and ADR above remain verifiable.
      </Callout>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <IllustrativeLabel>
        A real, committed sample receipt — every hash is verifiable; no live
        tenant data.
      </IllustrativeLabel>
      <HallucinationBadge record={record} />
      <ReceiptCard record={record} variant="full" />
    </div>
  );
}

/**
 * Server-only groundedness badge (ADR-124), mirroring the /console decision
 * replica. The score rides on the audit record's v5 `metadata` — no endpoint.
 * Absent / non-numeric score → renders nothing.
 */
const HALLUCINATION_BUCKET_STYLE: Record<string, string> = {
  grounded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  uncertain: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  hallucinated: "border-red-500/40 bg-red-500/10 text-red-300",
};

function HallucinationBadge({ record }: { readonly record: AuditRecord }) {
  const meta = record.metadata;
  const score = meta?.["hallucination_score"];
  if (typeof score !== "number") return null;

  const rawBucket = meta?.["hallucination_bucket"];
  const bucket = typeof rawBucket === "string" ? rawBucket : "uncertain";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-console-edge bg-console-panel px-3 py-2">
      <span className="text-[10px] uppercase tracking-section text-console-muted">
        Hallucination · ADR-124
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-section",
          HALLUCINATION_BUCKET_STYLE[bucket] ?? "border-console-edge text-console-muted",
        )}
      >
        {bucket}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-console-ink">
        score {score.toFixed(2)}
      </span>
      <span className="text-[11px] text-console-muted">
        — an upstream observability signal, not an argument to the decision.
      </span>
    </div>
  );
}

/* ── replica ───────────────────────────────────────────────────────────── */

/**
 * replica — the capability has a featured /console replica view rather than a
 * single rendered record. We show a prominent, dark "operator console" panel
 * (ConsoleChrome, which carries the standing illustrative honesty label) with a
 * one-line description and a button into the replica route.
 */
const REPLICA_BLURB: Record<string, { caption: string; line: string }> = {
  "ai-bom": {
    caption: "ai-bom · localhost:5180",
    line: "The full AI bill-of-materials explorer — every model, pack, guard and adapter in the deployment, at version, with its governing policy.",
  },
  "config-integrity-seal": {
    caption: "integrity · localhost:5180",
    line: "The configuration-integrity surface — the sealed-config health and any drift from the approved value, without exposing the configuration itself.",
  },
  "smart-approval-engine": {
    caption: "approvals · localhost:5180",
    line: "The Approval Center — the persisted registry of ESCALATEd intents, their decision history, and the audit chain a resolved approval resumes through.",
  },
};

function ReplicaExample({
  capability,
  spec,
}: {
  readonly capability: CapabilityContent;
  readonly spec: Extract<WorkedExampleSpec, { kind: "replica" }>;
}) {
  const blurb = REPLICA_BLURB[capability.slug] ?? {
    caption: "console · localhost:5180",
    line: "See this capability in the illustrative operator-console replica.",
  };

  return (
    <div className="flex flex-col gap-3">
      <ConsoleChrome caption={blurb.caption}>
        <div className="flex flex-col gap-4">
          <p className="text-[10px] uppercase tracking-section text-console-muted">
            See it live in the operator console
          </p>
          <p className="text-sm leading-relaxed text-console-ink">
            {blurb.line}
          </p>
          <a
            href={spec.replicaRoute}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-console-edge bg-console-panel px-3 py-2 text-sm font-medium text-console-ink transition-colors hover:border-console-ink/40"
          >
            Open the console replica
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <p className="font-mono text-[10px] text-console-muted">
            {spec.replicaRoute}
          </p>
        </div>
      </ConsoleChrome>
      <p className="text-xs text-console-muted">
        Illustrative replica · committed sample data, no live tenant detail.
      </p>
    </div>
  );
}

/* ── pack ──────────────────────────────────────────────────────────────── */

/**
 * pack — a governance pack's declared governed intents (mono chips) + the
 * outcome chips its policies most produce + the illustrative note. The pack is
 * NOT installed in the web kernel-runner, so this is reference content, not a
 * live run; the note states that plainly and the panel is labelled illustrative.
 */
function PackExample({
  spec,
}: {
  readonly spec: Extract<WorkedExampleSpec, { kind: "pack" }>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-console-edge bg-console-panel p-6">
      <IllustrativeLabel>Reference pack</IllustrativeLabel>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          Governed intents · {spec.intents.length}
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {spec.intents.map((intent) => (
            <li key={intent}>
              <code className="rounded-md border border-console-edge bg-console-canvas px-2 py-0.5 font-mono text-[11px] text-console-ink">
                {intent}
              </code>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          Outcomes its policies produce
        </span>
        <div className="flex flex-wrap gap-1.5">
          {spec.outcomes.map((kind) => (
            <DecisionChip key={kind} kind={kind} size="sm" />
          ))}
        </div>
      </div>

      {spec.note ? (
        <Callout tone="info" title="Illustrative — not a live run">
          {spec.note}
        </Callout>
      ) : null}
    </div>
  );
}

/* ── illustration ──────────────────────────────────────────────────────── */

/**
 * illustration — a titled explainer card for design-time / upstream-only
 * capabilities that have no live decision row, replica or transparency
 * projection to feature (policy-coherence analyzer, agent-memory store). Body
 * prose + a per-capability visual scaffold (a small flow/box diagram) + optional
 * outcome chips, clearly labelled illustrative.
 *
 * The diagram gives the dense prose a visual anchor: policy-coherence-analyzer
 * gets a Policy bundle → Static lint → Diagnostics flow with example findings;
 * agent-memory-store gets a two-lane box diagram showing that the decision lane
 * (Envelope + State S → Kernel) and the memory lane (Memory M → Prompt only)
 * never cross. Pure CSS/SVG, no motion, kept compact (~under 250px).
 */
function IllustrationExample({
  capability,
  spec,
}: {
  readonly capability: CapabilityContent;
  readonly spec: Extract<WorkedExampleSpec, { kind: "illustration" }>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-console-edge bg-console-panel p-6">
      <IllustrativeLabel>Illustrative explainer</IllustrativeLabel>
      <h3 className="text-lg font-semibold tracking-tight text-console-ink">
        {spec.title}
      </h3>

      <IllustrationDiagram slug={capability.slug} />

      <p className="max-w-3xl text-sm leading-relaxed text-console-muted">
        {spec.body}
      </p>
      {spec.outcomes && spec.outcomes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
            Outcomes
          </span>
          <div className="flex flex-wrap gap-1.5">
            {spec.outcomes.map((kind) => (
              <DecisionChip key={kind} kind={kind} size="sm" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Per-capability visual scaffold for the illustration-kind worked examples.
 * Dispatches on slug; returns null for any capability without a bespoke
 * diagram (so the card simply falls back to prose). Static — no motion.
 */
function IllustrationDiagram({ slug }: { readonly slug: string }) {
  if (slug === "policy-coherence-analyzer") return <PolicyCoherenceDiagram />;
  if (slug === "agent-memory-store") return <AgentMemoryDiagram />;
  return null;
}

/**
 * Policy-coherence-analyzer scaffold: a left-to-right three-step flow
 * (Policy bundle → Static lint → Diagnostics) over a list of example
 * diagnostics. Reinforces that the analyzer is a design-time pass over the
 * bundle source, not a runtime decision.
 */
function PolicyCoherenceDiagram() {
  const steps = [
    { icon: FileCode2, label: "Policy bundle", sub: "rules + phases" },
    { icon: ScanSearch, label: "Static lint", sub: "AJD-301 · CI" },
    { icon: ListChecks, label: "Diagnostics", sub: "structured findings" },
  ] as const;

  const diagnostics = [
    "Rule shadow: a Phase-1 REFUSE shadows a Phase-2 REWRITE that can never fire.",
    "Dead rule: a guard whose condition is unsatisfiable for every envelope.",
    "Threshold conflict: two rules set contradictory caps on the same field.",
  ] as const;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-console-edge bg-console-canvas p-4">
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-2">
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-console-edge bg-console-panel px-3 py-3 text-center">
              <step.icon size={18} className="text-console-muted" aria-hidden="true" />
              <span className="text-xs font-semibold leading-tight text-console-ink">
                {step.label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
                {step.sub}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div className="flex items-center justify-center">
                <ArrowRight size={16} className="text-console-faint" aria-hidden="true" />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>

      <ul className="flex flex-col gap-1.5">
        {diagnostics.map((d) => {
          const [head, ...rest] = d.split(":");
          return (
            <li
              key={d}
              className="flex items-start gap-2 text-xs leading-relaxed text-console-muted"
            >
              <span
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-refuse"
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-console-ink">{head}:</span>
                {rest.join(":")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Agent-memory-store scaffold: a two-lane box diagram. The decision lane
 * (Envelope + State S → Kernel → decision) and the memory lane (Memory M →
 * Prompt only) run in parallel and never cross — the visual proof that M is
 * upstream-only and cannot move an adjudication.
 */
function AgentMemoryDiagram() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-console-edge bg-console-canvas p-4">
      {/* Decision lane — drives the kernel. */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          Decision lane · drives the kernel
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <LaneBox label="Envelope + State S" tone="ink" />
          <ArrowRight size={16} className="text-console-faint" aria-hidden="true" />
          <LaneBox label="Kernel · adjudicate" tone="ink" />
          <ArrowRight size={16} className="text-console-faint" aria-hidden="true" />
          <LaneBox label="Decision (deterministic)" tone="execute" />
        </div>
      </div>

      {/* The isolation barrier. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-console-edge" />
        <span className="font-mono text-[10px] uppercase tracking-section text-console-faint">
          never crosses
        </span>
        <span className="h-px flex-1 bg-console-edge" />
      </div>

      {/* Memory lane — prompt-only, never an argument to the decision. */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          Memory lane · prompt only
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <LaneBox label="Memory M" tone="defer" />
          <ArrowRight size={16} className="text-console-faint" aria-hidden="true" />
          <LaneBox label="Prompt / planner context" tone="muted" />
          <span className="rounded-md border border-console-edge bg-console-panel px-2 py-1 text-[10px] uppercase tracking-section text-console-muted">
            not envelope · not state · not a guard
          </span>
        </div>
      </div>
    </div>
  );
}

const LANE_TONE: Record<string, string> = {
  ink: "border-console-edge bg-console-panel text-console-ink",
  execute: "border-execute/40 bg-execute/10 text-execute",
  defer: "border-defer/40 bg-defer/10 text-defer",
  muted: "border-console-edge bg-console-panel text-console-muted",
};

function LaneBox({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: keyof typeof LANE_TONE | string;
}) {
  return (
    <span
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium",
        LANE_TONE[tone] ?? LANE_TONE.ink,
      )}
    >
      {label}
    </span>
  );
}

/* ── shared ────────────────────────────────────────────────────────────── */

/**
 * The standing "illustrative" honesty label every fixture-illustrative
 * worked-example variant carries (the no-fake-live-data invariant). A small
 * amber pill + caption.
 */
function IllustrativeLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-section text-console-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-defer" />
      <span className="rounded-sm border border-defer/40 bg-defer/10 px-1.5 py-0.5 text-defer">
        Illustrative
      </span>
      <span className="normal-case tracking-normal text-console-muted">{children}</span>
    </p>
  );
}

function PublicDataLink({
  href,
  label,
}: {
  readonly href: string;
  readonly label: string;
}) {
  return (
    <p className="text-xs text-console-muted">
      Source projection ·{" "}
      <a
        href={href}
        className="font-medium text-console-ink underline decoration-console-edge underline-offset-2 transition-colors hover:decoration-console-ink"
      >
        public {label} view
      </a>{" "}
      — aggregate-only, illustrative sample data.
    </p>
  );
}
