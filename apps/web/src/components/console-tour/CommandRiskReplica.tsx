import type { AuditRecord } from "@adjudicate/core";
import { ConsoleChrome } from "@/components/console-kit/chrome/ConsoleChrome";
import { BarDistribution } from "@/components/console-kit/charts/BarDistribution";
import type { SeriesPoint } from "@/components/console-kit/charts/types";
import { DataTable } from "@/components/console-kit/a11y/DataTable";
import type { DataTableColumn } from "@/components/console-kit/a11y/DataTable";
import { decisionTheme } from "@/components/console-kit/decision-theme";
import { projectCommandRiskTransparency } from "@/lib/command-risk-transparency";
import { COMMAND_RISK_TRANSPARENCY_SAMPLE } from "@/lib/transparency-fixtures";
import { CONSOLE_REPLICA_RECORDS } from "@/lib/console-replica-records";
import { cn } from "@/lib/cn";

/**
 * CommandRiskReplica — a static replica of the operator console's Command Risk
 * surface (ADR-134, ADR-123): the shell-command-risk dispositions emitted by
 * `createCommandRiskGuard`.
 *
 * SERVER component, rendered inside {@link ConsoleChrome} (the reviewed honesty
 * boundary — the standing "Illustrative replica · sample data" label is
 * non-removable). Three regions over committed sample fixtures:
 *
 *   1. Risk distribution by category — a {@link BarDistribution} of counts per
 *      category, from the aggregate-only `command-risk-transparency` projection.
 *   2. Disposition totals — blocked / rewritten / confirm tallies, derived from
 *      the command-risk sample records.
 *   3. Blocked-commands table — the refuse-disposition drill-down, showing ONLY
 *      timestamp + intent kind + decision + category.
 *
 * SECURITY — NO COMMAND TEXT, EVER. The real guard threads the RAW command
 * string (which routinely embeds live secrets) and the matched rule ids (which
 * telegraph attack construction) into its audit detail. This replica is built
 * entirely on (a) the `command-risk-transparency` aggregate (category + count
 * only) and (b) the closed-enum `category` carried in the sample records' basis
 * detail. NEITHER the chart, the totals, nor the blocked-commands table has any
 * field that could carry command text or a rule id — redaction is by
 * construction, so this UI cannot leak a command even if it tried. No clock, no
 * RNG, no network, no admin/DB access — fixed literals only.
 */

/** Closed-enum command-risk disposition. */
type CommandRiskDisposition = "refuse" | "rewrite" | "confirm";

/** Map an AuditRecord decision kind to a command-risk disposition (or none). */
function dispositionFor(
  kind: AuditRecord["decision"]["kind"],
): CommandRiskDisposition | undefined {
  if (kind === "REFUSE") return "refuse";
  if (kind === "REWRITE") return "rewrite";
  if (kind === "REQUEST_CONFIRMATION") return "confirm";
  return undefined;
}

/**
 * Extract the closed-enum command-risk category from a record's decision basis.
 * The sample records carry it as `basis.detail.category` (e.g.
 * `{ category: "destructive" }`) — the ONLY command-risk datum that is ever read,
 * never the raw command. Returns `undefined` for non-command records.
 */
function categoryFor(record: AuditRecord): string | undefined {
  for (const b of record.decision.basis) {
    const detail = b.detail;
    if (detail && typeof detail["category"] === "string") {
      return detail["category"] as string;
    }
  }
  return undefined;
}

/** A command-risk record is a `shell.exec` intent carrying a category basis. */
function isCommandRiskRecord(record: AuditRecord): boolean {
  return record.envelope.kind === "shell.exec" && categoryFor(record) !== undefined;
}

/** Per-category text accent for the category cell. */
const CATEGORY_STYLE: Record<string, string> = {
  destructive: "text-red-300",
  credential: "text-fuchsia-300",
  network: "text-amber-300",
};

const TABLE_COLUMNS: readonly DataTableColumn[] = [
  { key: "at", header: "Time" },
  { key: "intentKind", header: "Intent kind" },
  { key: "decision", header: "Decision" },
  { key: "category", header: "Category" },
];

export function CommandRiskReplica({
  className,
}: {
  readonly className?: string;
}) {
  // Region 1 — category distribution from the aggregate-only public projection.
  // The public buckets carry only `category` + a cohort-floored count: `value`
  // is the chart-safe number (small cohorts lifted to the floor so a bar can't
  // reveal an exact small value), `display` is the honest "<5" / "N" label. We
  // chart `value` and format the legend with `display` so a censored bucket
  // reads "<5" rather than its floored bar height.
  const categoryBuckets = projectCommandRiskTransparency(
    COMMAND_RISK_TRANSPARENCY_SAMPLE,
  )
    // Drop the always-zero `safe` category — it carries no audit basis.
    .filter((b) => b.category !== "safe");
  const categoryBars: readonly SeriesPoint[] = categoryBuckets.map((b) => ({
    label: b.categoryLabel,
    value: b.value,
  }));
  const categoryDisplay = new Map<number, string>(
    categoryBuckets.map((b) => [b.value, b.display]),
  );

  // Regions 2 & 3 — derived from the committed command-risk sample records. We
  // read ONLY the decision kind (→ disposition), the closed-enum category, the
  // intent kind, and the timestamp. Never the command text.
  const commandRecords = CONSOLE_REPLICA_RECORDS.filter(isCommandRiskRecord);

  const dispositionTotals: Record<CommandRiskDisposition, number> = {
    refuse: 0,
    rewrite: 0,
    confirm: 0,
  };
  for (const r of commandRecords) {
    const d = dispositionFor(r.decision.kind);
    if (d) dispositionTotals[d] += 1;
  }

  // The blocked-commands list is the `refuse`-disposition drill-down, newest
  // first. NO command column — redacted by construction.
  const blockedRecords = commandRecords
    .filter((r) => dispositionFor(r.decision.kind) === "refuse")
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  const rows = blockedRecords.map((r) => {
    const category = categoryFor(r) ?? "—";
    const token = decisionTheme[r.decision.kind];
    return {
      _key: `${r.intentHash}:${r.at}:${category}`,
      at: (
        <time title={r.at} className="tabular-nums text-console-muted">
          {formatClock(r.at)}
        </time>
      ),
      intentKind: <span className="text-console-ink">{r.envelope.kind}</span>,
      decision: (
        <span className={cn("tabular-nums", token.fg)}>{token.label}</span>
      ),
      category: (
        <span
          className={cn(
            "uppercase tracking-section",
            CATEGORY_STYLE[category] ?? "text-console-muted",
          )}
        >
          {category}
        </span>
      ),
    } satisfies Record<string, React.ReactNode> & { _key: string };
  });

  return (
    <ConsoleChrome caption="command-risk · localhost:5180" className={className}>
      <div className="flex flex-col gap-4">
        <header className="flex items-baseline justify-between border-b border-console-edge pb-3">
          <h2 className="text-[10px] uppercase tracking-section text-console-muted">
            Command Risk · Shell-command dispositions
          </h2>
          <span className="text-[10px] text-console-faint">
            ADR-134 · ADR-123
          </span>
        </header>

        {/* Aggregate context: category distribution + disposition totals. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-sm border border-console-edge bg-console-panel/40 p-3">
            <BarDistribution
              title="Risk distribution by category"
              data={categoryBars}
              valueFormat={(n) => categoryDisplay.get(n) ?? n.toLocaleString()}
            />
          </section>

          <section className="rounded-sm border border-console-edge bg-console-panel/40 p-3">
            <header className="mb-2 text-[10px] uppercase tracking-section text-console-faint">
              Disposition totals
            </header>
            <dl
              className="grid grid-cols-3 gap-2"
              data-testid="disposition-totals"
            >
              <SummaryStat
                label="Blocked"
                value={dispositionTotals.refuse}
                emphasize={dispositionTotals.refuse > 0}
              />
              <SummaryStat label="Rewritten" value={dispositionTotals.rewrite} />
              <SummaryStat label="Confirm" value={dispositionTotals.confirm} />
            </dl>
            {/* CONFIRM-queue cross-link: commands routed to
                REQUEST_CONFIRMATION are reviewed in the Approval Center. */}
            <p
              className="mt-3 text-[11px] text-console-muted"
              data-testid="confirm-queue-crosslink"
            >
              <span className="tabular-nums text-sky-300">
                {dispositionTotals.confirm}
              </span>{" "}
              command{dispositionTotals.confirm === 1 ? "" : "s"} routed to
              confirmation — reviewed in the Approval Center replica.
            </p>
          </section>
        </div>

        {/* Blocked-commands list — refuse-disposition drill-down. NO command. */}
        <section className="flex flex-col gap-2">
          <header className="flex items-baseline justify-between">
            <h3 className="text-[10px] uppercase tracking-section text-console-faint">
              Blocked commands
            </h3>
            <span className="text-[10px] italic text-console-faint">
              Command text is never shown — redacted by construction.
            </span>
          </header>
          <DataTable
            caption="Blocked command-risk dispositions"
            columns={TABLE_COLUMNS}
            rows={rows}
            getRowKey={(row, i) => String(row["_key"] ?? i)}
            emptyMessage="No blocked commands in this window."
          />
        </section>
      </div>
    </ConsoleChrome>
  );
}

/** A single disposition tally, optionally emphasised (red) when non-zero. */
function SummaryStat({
  label,
  value,
  emphasize = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-console-edge bg-console-canvas/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-section text-console-faint">
        {label}
      </dt>
      <dd
        className={cn(
          "text-lg tabular-nums",
          emphasize ? "text-red-300" : "text-console-ink",
        )}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/**
 * Render the fixed ISO timestamp as a stable `HH:MM:SS` clock (UTC). Fixtures
 * carry FIXED literal timestamps, so we format an absolute, deterministic clock
 * rather than a wall-clock "x ago" — the replica must not call a live time
 * source, and SSR/CSR must agree.
 */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}
