/**
 * console-replica-dashboard — ILLUSTRATIVE, fully-static data for the
 * decision-outcome dashboard replica under /console/dashboard.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It exists ONLY to drive the clearly-labeled
 * "Illustrative replica of the operator console" surface (rendered inside the
 * ConsoleChrome honesty boundary). apps/web is a public, unauthenticated
 * marketing surface with NO database/redis/admin credentials — it never reads a
 * live `governance.outcomeDistribution` aggregate. These literals stand in for
 * what that aggregate would return over a representative window.
 *
 * SYNTHETIC + STATIC: the time-bucketed distribution below is hand-authored to
 * read like a believable operator window (a steady EXECUTE baseline with
 * intermittent REFUSE/DEFER/ESCALATE/CONFIRM/REWRITE activity). The per-kind
 * totals and the top-refusals list are DERIVED from these same literals so they
 * can never drift from the chart. Every value is a FIXED literal — no
 * wall-clock (`Date.now()` / `new Date()`) and no random source is ever called,
 * so the dashboard renders identically across builds, machines, and SSR/CSR.
 *
 * Refusal codes/labels are illustrative aggregate strings — they carry NO raw
 * command text, NO real tenant-session ids, and NO PII.
 */

import type { DecisionKind } from "@adjudicate/core";
import { DECISION_KIND_ORDER } from "@/components/console-kit/decision-theme";
import type { OutcomeBucket } from "@/components/console-kit/charts/OutcomeChart";

/**
 * Illustrative 12-bucket outcome distribution — two-hour buckets across a
 * representative 24-hour operator window on a fixed sample day. Pre-sorted
 * ascending by `at`, exactly as the chart's caller contract requires. The ISO
 * timestamps are fixed literals (the date is arbitrary, chosen only so the
 * axis labels read like a real day).
 */
export const CONSOLE_REPLICA_OUTCOME_BUCKETS: readonly OutcomeBucket[] = [
  { at: "2026-05-13T00:00:00.000Z", EXECUTE: 31, REFUSE: 4, DEFER: 3, ESCALATE: 1, REQUEST_CONFIRMATION: 2, REWRITE: 1 },
  { at: "2026-05-13T02:00:00.000Z", EXECUTE: 22, REFUSE: 3, DEFER: 2, ESCALATE: 0, REQUEST_CONFIRMATION: 1, REWRITE: 1 },
  { at: "2026-05-13T04:00:00.000Z", EXECUTE: 18, REFUSE: 2, DEFER: 2, ESCALATE: 1, REQUEST_CONFIRMATION: 1, REWRITE: 0 },
  { at: "2026-05-13T06:00:00.000Z", EXECUTE: 27, REFUSE: 3, DEFER: 4, ESCALATE: 1, REQUEST_CONFIRMATION: 2, REWRITE: 1 },
  { at: "2026-05-13T08:00:00.000Z", EXECUTE: 44, REFUSE: 6, DEFER: 5, ESCALATE: 2, REQUEST_CONFIRMATION: 4, REWRITE: 2 },
  { at: "2026-05-13T10:00:00.000Z", EXECUTE: 52, REFUSE: 7, DEFER: 6, ESCALATE: 3, REQUEST_CONFIRMATION: 5, REWRITE: 3 },
  { at: "2026-05-13T12:00:00.000Z", EXECUTE: 58, REFUSE: 9, DEFER: 7, ESCALATE: 2, REQUEST_CONFIRMATION: 6, REWRITE: 3 },
  { at: "2026-05-13T14:00:00.000Z", EXECUTE: 49, REFUSE: 8, DEFER: 5, ESCALATE: 3, REQUEST_CONFIRMATION: 4, REWRITE: 2 },
  { at: "2026-05-13T16:00:00.000Z", EXECUTE: 55, REFUSE: 6, DEFER: 6, ESCALATE: 2, REQUEST_CONFIRMATION: 5, REWRITE: 4 },
  { at: "2026-05-13T18:00:00.000Z", EXECUTE: 47, REFUSE: 5, DEFER: 4, ESCALATE: 1, REQUEST_CONFIRMATION: 3, REWRITE: 2 },
  { at: "2026-05-13T20:00:00.000Z", EXECUTE: 38, REFUSE: 4, DEFER: 3, ESCALATE: 2, REQUEST_CONFIRMATION: 3, REWRITE: 1 },
  { at: "2026-05-13T22:00:00.000Z", EXECUTE: 29, REFUSE: 3, DEFER: 2, ESCALATE: 1, REQUEST_CONFIRMATION: 2, REWRITE: 1 },
] as const;

/**
 * Per-kind totals over the whole window. DERIVED (summed) from
 * {@link CONSOLE_REPLICA_OUTCOME_BUCKETS} so the StatTiles can never disagree
 * with the stacked chart. Computed once at module load over fixed literals —
 * still fully static.
 */
export const CONSOLE_REPLICA_OUTCOME_TOTALS: Readonly<
  Record<DecisionKind, number>
> = CONSOLE_REPLICA_OUTCOME_BUCKETS.reduce(
  (acc, b) => {
    for (const k of DECISION_KIND_ORDER) acc[k] += b[k];
    return acc;
  },
  {
    EXECUTE: 0,
    REFUSE: 0,
    DEFER: 0,
    ESCALATE: 0,
    REQUEST_CONFIRMATION: 0,
    REWRITE: 0,
  } as Record<DecisionKind, number>,
);

/** Total adjudicated decisions across the window — derived. */
export const CONSOLE_REPLICA_DECISION_TOTAL: number = DECISION_KIND_ORDER.reduce(
  (s, k) => s + CONSOLE_REPLICA_OUTCOME_TOTALS[k],
  0,
);

/** One aggregated refusal reason — an illustrative `refusal.code` rollup. */
export interface ReplicaRefusalReason {
  /** Stable closed-enum refusal code (illustrative — never raw command text). */
  readonly code: string;
  /** Short human label for the reason. */
  readonly label: string;
  /** Occurrence count over the window. */
  readonly count: number;
}

/**
 * Top refusal reasons over the window — an illustrative aggregate by
 * `refusal.code`, the rollup the console's `audit.query`-backed panel shows.
 * Pre-sorted descending by count; the counts sum to the REFUSE total above
 * ({@link CONSOLE_REPLICA_OUTCOME_TOTALS.REFUSE}) so the panel reconciles with
 * the chart. Codes are illustrative and carry no raw command text or PII.
 */
export const CONSOLE_REPLICA_TOP_REFUSALS: readonly ReplicaRefusalReason[] = [
  { code: "pix.charge.already_refunded", label: "Charge already refunded", count: 21 },
  { code: "command_risk_blocked", label: "Destructive command blocked", count: 14 },
  { code: "state.transition_illegal", label: "Illegal state transition", count: 11 },
  { code: "auth.scope_insufficient", label: "Scope insufficient", count: 8 },
  { code: "taint.level_forbidden", label: "Taint level forbidden", count: 6 },
] as const;
