import Link from "next/link";
import type { AuditRecord } from "@adjudicate/core";
import { decisionTheme } from "@/components/console-kit/decision-theme";
import { cn } from "@/lib/cn";

interface AuditTableReplicaProps {
  /** Records to render, newest-first. */
  readonly records: readonly AuditRecord[];
  /**
   * `intentHash` values that just arrived. Their rows get a 1.5s emerald
   * highlight that fades via `transition-colors` (no keyframe needed). The
   * caller clears the set after the fade window.
   */
  readonly highlightHashes?: ReadonlySet<string>;
}

/**
 * Audit-table replica — a plain `<table>` (NOT @tanstack/react-table) that
 * mirrors the operator console's Audit Explorer columns: Decision badge,
 * Intent kind, truncated intentHash, and relative time. Rows are newest-first
 * and each links to the decision-receipt route.
 *
 * This is a SERVER component (no interactivity of its own); the parent client
 * component feeds it the simulated-tail records + highlight set. Highlighted
 * rows render with an emerald tint that the parent removes after 1.5s — the
 * `transition-colors` makes that removal fade out, so under reduced motion the
 * (never-set) highlight simply never appears.
 */
export function AuditTableReplica({
  records,
  highlightHashes,
}: AuditTableReplicaProps) {
  return (
    <div className="overflow-auto rounded-md border border-console-edge bg-console-panel/40">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-console-panel">
          <tr className="border-b border-console-edge">
            <th
              scope="col"
              className="px-2.5 py-2 text-left text-[10px] uppercase tracking-section text-console-faint"
            >
              Decision
            </th>
            <th
              scope="col"
              className="px-2.5 py-2 text-left text-[10px] uppercase tracking-section text-console-faint"
            >
              Intent
            </th>
            <th
              scope="col"
              className="px-2.5 py-2 text-left text-[10px] uppercase tracking-section text-console-faint"
            >
              Hash
            </th>
            <th
              scope="col"
              className="px-2.5 py-2 text-right text-[10px] uppercase tracking-section text-console-faint"
            >
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-10 text-center">
                <p className="text-[11px] italic text-console-faint">
                  No records yet — start the simulation to tail arrivals.
                </p>
              </td>
            </tr>
          ) : (
            records.map((record) => {
              const highlighted = Boolean(
                highlightHashes?.has(record.intentHash),
              );
              return (
                <tr
                  key={record.intentHash}
                  className={cn(
                    "border-b border-console-edge/60 transition-colors duration-[1500ms] ease-out hover:bg-console-edge/30",
                    highlighted && "bg-emerald-500/10",
                  )}
                >
                  <td className="px-2.5 py-2 align-top">
                    <DecisionBadgeReplica kind={record.decision.kind} />
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    <Link
                      href={`/console/decision/${record.intentHash}`}
                      className="text-console-ink underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {record.envelope.kind}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    <code className="text-[10px] text-console-faint">
                      {truncateHash(record.intentHash)}
                    </code>
                  </td>
                  <td className="px-2.5 py-2 text-right align-top">
                    <time
                      title={record.at}
                      className="tabular-nums text-console-muted"
                    >
                      {formatClock(record.at)}
                    </time>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Compact decision badge driven by the console-kit {@link decisionTheme}. The
 * theme's default-tailwind decision classes read correctly on dark, so no
 * token rename applies (matches the kit's documented decision-class policy).
 */
function DecisionBadgeReplica({ kind }: { kind: AuditRecord["decision"]["kind"] }) {
  const token = decisionTheme[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        token.fg,
        token.bg,
        token.border,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", token.dot)}
      />
      {token.label}
    </span>
  );
}

/** Truncate a hash to `head…tail` for dense display. Pure, no deps. */
function truncateHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/**
 * Render the fixed ISO timestamp as a stable `HH:MM:SS` clock (UTC). The
 * fixtures carry FIXED literal timestamps, so we deliberately format an
 * absolute, deterministic clock rather than a wall-clock "x ago" — the replica
 * must not call a live time source, and SSR/CSR must agree.
 */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}
