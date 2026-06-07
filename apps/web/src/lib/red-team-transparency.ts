/**
 * Public red-team transparency projection (ADR-133, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. The operator console shows
 * the full adversarial report — per-scenario NAMES, the firing `basisCodes`,
 * decisions, raw escape payloads, and a per-vector escape table. Each of those
 * either telegraphs how an attack is constructed (`name`, `basisCodes`) or
 * advertises a live hole (`escapesByVector`, raw `escaped` counts), so the
 * public view must publish NONE of it.
 *
 * `projectRedTeamDefenses` is therefore an AGGREGATE-ONLY, BANDED projection.
 * It reads only each pack's `total` + `defended` count and emits, per shipped
 * pack:
 *   (a) the `total` and `defended` counts (a count, never a scenario),
 *   (b) a BOOLEAN `lastRunStatus` band — `clean` when every scenario was
 *       defended, `regressed` otherwise (never the raw escaped/error number,
 *       never WHICH vector regressed).
 * It NEVER reads — and the output type cannot carry — a scenario `name`, a
 * `basisCode`, a `decision`, an `error`, an `acceptable` set, a per-vector
 * `escapesByVector` map, or a raw `escaped`/`errors` count. This is the
 * load-bearing safety property of the public red-team status.
 */

import type { RedTeamDefenseSample } from "./transparency-fixtures";

/** Boolean defense band — clean when all defended, regressed otherwise. */
export type RedTeamDefenseStatus = "clean" | "regressed";

/**
 * The public, sanitized per-pack red-team payload. This is the COMPLETE shape
 * that reaches the public page — an explicit allowlist of aggregates. No
 * scenario name, basis code, decision, error, vector breakdown, or raw escape
 * count ever appears here.
 */
export interface PublicRedTeamDefense {
  readonly packId: string;
  readonly displayName: string;
  /** Scenarios exercised by the suite (a count, never the scenarios). */
  readonly total: number;
  /** Scenarios the policy defended (a count). */
  readonly defended: number;
  /** Boolean band: clean (all defended) vs regressed. Never a raw escape count. */
  readonly lastRunStatus: RedTeamDefenseStatus;
}

/**
 * Project an illustrative red-team defense sample into its public,
 * aggregate-only form. Pure and deterministic over the input; no clock/RNG/I/O.
 * `lastRunStatus` is derived as `defended >= total ? "clean" : "regressed"` so a
 * tampered `defended > total` still reads "clean" without leaking a count.
 */
export function projectRedTeamDefense(
  sample: RedTeamDefenseSample,
): PublicRedTeamDefense {
  const total = Math.max(0, Math.trunc(sample.total));
  const defended = Math.max(0, Math.min(total, Math.trunc(sample.defended)));
  return {
    packId: sample.packId,
    displayName: sample.displayName,
    total,
    defended,
    lastRunStatus: defended >= total ? "clean" : "regressed",
  };
}

/** Project the full sample set, preserving fixture order. Pure. */
export function projectRedTeamDefenses(
  samples: readonly RedTeamDefenseSample[],
): readonly PublicRedTeamDefense[] {
  return samples.map(projectRedTeamDefense);
}
