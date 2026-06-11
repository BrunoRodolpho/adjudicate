/**
 * red-team-replica — ILLUSTRATIVE operator-detail data for the red-team replica
 * under /console/red-team (ADR-133).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS IS COMMITTED SAMPLE DATA. It exists ONLY to drive the clearly-labeled
 * "Illustrative replica of the operator console" surface, rendered inside the
 * ConsoleChrome honesty boundary. apps/web is a public, unauthenticated
 * marketing surface with NO database/redis/admin credentials — it never reads a
 * live `governance.redTeam` report or `governance.redTeamHistory` series. These
 * literals stand in for what those would return.
 *
 * SYNTHETIC + STATIC: every value below is a FIXED literal. There is no
 * wall-clock (`Date.now()` / `new Date()`) and no random source anywhere in
 * this module, so the replica renders identically across builds, machines, and
 * SSR/CSR.
 *
 * SAFETY (load-bearing): the operator console's red-team report carries
 * per-scenario NAMES, firing `basisCodes`, decisions, and raw escape payloads —
 * each of which telegraphs how an attack is constructed or advertises a live
 * hole. NONE of that may reach apps/web. This fixture therefore carries ONLY:
 *   (a) the closed-enum attack VECTOR category + a scenario COUNT per vector,
 *   (b) per-run defended/escaped/error COUNTS + a fixed digest + pack id + time.
 * It carries NO scenario name, NO basis code, NO decision, NO attack payload,
 * and NO per-vector escape breakdown — there is no field that could. The public
 * transparency projection is even coarser (clean/regressed boolean only); this
 * operator-detail fixture is the deepest the replica is allowed to show.
 */

/**
 * Closed-enum attack vector — byte-equal to the operator console's
 * `VECTOR_LABEL` keys (apps/console red-team page). The vector is a generic
 * attack CATEGORY, never a scenario name or payload.
 */
export type RedTeamVector =
  | "prompt_injection"
  | "taint_escalation"
  | "tool_scope_violation";

/** Stable order over the closed vector set (mirrors the console). */
export const RED_TEAM_VECTOR_ORDER: readonly RedTeamVector[] = [
  "prompt_injection",
  "taint_escalation",
  "tool_scope_violation",
];

/** Public vector labels — mirrors the operator console's `VECTOR_LABEL`. */
export const RED_TEAM_VECTOR_LABEL: Record<RedTeamVector, string> = {
  prompt_injection: "Prompt Injection",
  taint_escalation: "Taint Escalation",
  tool_scope_violation: "Tool-Scope Violation",
};

/** One ILLUSTRATIVE pass/fail summary — aggregate counts only. */
export interface ReplicaRedTeamSummary {
  /** Total scenarios exercised by the suite. */
  readonly total: number;
  /** Scenarios the policy defended. */
  readonly defended: number;
  /** Scenarios that escaped (a policy regression when > 0). */
  readonly escaped: number;
  /** Scenarios that errored during evaluation. */
  readonly errors: number;
}

/** Scenario count per attack vector (a COUNT, never the scenarios). */
export interface ReplicaRedTeamVectorCount {
  readonly vector: RedTeamVector;
  readonly count: number;
}

/** One ILLUSTRATIVE trend point — defended/escaped at a fixed run time. */
export interface ReplicaRedTeamTrendPoint {
  /** Fixed ISO run time (a literal — never a wall-clock read). */
  readonly at: string;
  readonly defended: number;
  readonly escaped: number;
}

/** One ILLUSTRATIVE recorded run for the run-history table. Counts + digest only. */
export interface ReplicaRedTeamRun {
  /** Fixed ISO run time (a literal). */
  readonly at: string;
  /** Public pack id the suite ran against. */
  readonly packId: string;
  /** Per-run aggregate summary. */
  readonly summary: ReplicaRedTeamSummary;
  /** Fixed illustrative report digest (a hash, never a payload). */
  readonly digest: string;
}

/**
 * The full operator-detail red-team fixture for the replica.
 *
 *  - `summary` — the latest run's pass/fail roll-up (total/defended/escaped).
 *  - `vectorCounts` — scenarios per attack vector for the BarDistribution.
 *  - `trend` — defended vs escaped per run for the StackedAreaChart (ascending
 *    by time, the chart's caller contract).
 *  - `runs` — the run-history table (NEWEST first, the console's order).
 */
export interface RedTeamReplicaFixture {
  readonly summary: ReplicaRedTeamSummary;
  readonly vectorCounts: readonly ReplicaRedTeamVectorCount[];
  readonly trend: readonly ReplicaRedTeamTrendPoint[];
  readonly runs: readonly ReplicaRedTeamRun[];
}

/**
 * Illustrative red-team posture for the reference deployment. The latest run
 * defended every scenario (the healthy posture a reference deployment
 * advertises), while the run history carries one earlier regression so the
 * trend chart and the history table both exercise a non-zero escape. Scenario
 * counts per vector sum to the latest run's `total`. Counts + digests only; no
 * scenario names, payloads, or basis codes appear anywhere.
 */
export const RED_TEAM_REPLICA: RedTeamReplicaFixture = {
  // Latest run — fully defended (33 scenarios, 0 escaped, 0 errors).
  summary: { total: 33, defended: 33, escaped: 0, errors: 0 },
  // Scenarios per attack vector for the latest run; sums to summary.total (33).
  vectorCounts: [
    { vector: "prompt_injection", count: 14 },
    { vector: "taint_escalation", count: 10 },
    { vector: "tool_scope_violation", count: 9 },
  ],
  // Defended vs escaped per recorded run, ASCENDING by time (chart contract).
  // The 2026-05-11 run carries a single escape (a regression that was since
  // closed) so the trend is legible; everything after is clean.
  trend: [
    { at: "2026-05-09T00:00:00.000Z", defended: 33, escaped: 0 },
    { at: "2026-05-10T00:00:00.000Z", defended: 33, escaped: 0 },
    { at: "2026-05-11T00:00:00.000Z", defended: 32, escaped: 1 },
    { at: "2026-05-12T00:00:00.000Z", defended: 33, escaped: 0 },
    { at: "2026-05-13T00:00:00.000Z", defended: 33, escaped: 0 },
  ],
  // Run-history table — NEWEST first (mirrors the console's order). The
  // 2026-05-11 run is the recorded regression.
  runs: [
    {
      at: "2026-05-13T00:00:00.000Z",
      packId: "pack-deployments-approval",
      summary: { total: 33, defended: 33, escaped: 0, errors: 0 },
      digest: "a1b2c3d4e5f60718",
    },
    {
      at: "2026-05-12T00:00:00.000Z",
      packId: "pack-deployments-approval",
      summary: { total: 33, defended: 33, escaped: 0, errors: 0 },
      digest: "b2c3d4e5f6071829",
    },
    {
      at: "2026-05-11T00:00:00.000Z",
      packId: "pack-deployments-approval",
      summary: { total: 33, defended: 32, escaped: 1, errors: 0 },
      digest: "c3d4e5f607182930",
    },
    {
      at: "2026-05-10T00:00:00.000Z",
      packId: "pack-deployments-approval",
      summary: { total: 33, defended: 33, escaped: 0, errors: 0 },
      digest: "d4e5f60718293041",
    },
    {
      at: "2026-05-09T00:00:00.000Z",
      packId: "pack-deployments-approval",
      summary: { total: 33, defended: 33, escaped: 0, errors: 0 },
      digest: "e5f6071829304152",
    },
  ],
};
