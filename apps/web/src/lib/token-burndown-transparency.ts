/**
 * Public token-governance transparency projection (ADR-135, dual-app strategy).
 *
 * `apps/web` is a PUBLIC, unauthenticated surface. This module projects the
 * illustrative single-tenant token burn-down fixture down to an AGGREGATE-ONLY
 * burn-down for public display: a coarse percent-used, a banded ok/warn/exhausted
 * label, and COARSELY-ROUNDED consumed/budget figures.
 *
 * SECURITY — REDACTION BY CONSTRUCTION: the operator console exposes per-tenant
 * AND per-session token counts, tenant ids, session ids, and a budget-exhaustion
 * timeline (every one of which leaks customer scale, usage, or identity). This
 * projection reads ONLY a single aggregate `consumed`/`budget` pair and emits a
 * shape that has NO field for any id, any per-session row, or any exhaustion
 * detail — it is physically impossible to leak a session id, a tenant id, or a
 * raw per-customer count through this surface. The exact figures are additionally
 * coarsened: counts are rounded to a coarse unit and surfaced as a "≈" display
 * string, and the precise pctUsed is only ever bucketed into a 3-value band for
 * the colour/icon — so an attacker cannot confirm "my injected loop drove cost
 * up" from this page.
 */
import type { TokenBurndownTransparencySample } from "./transparency-fixtures";

/** Coarse banding of budget pressure — the only "live" signal the public view exposes. */
export type TokenBurndownBand = "ok" | "warn" | "exhausted";

/** Near-budget threshold (warn band) as a fraction of the cap. */
const WARN_FRACTION = 0.8;

/** Coarse rounding unit for public counts (10k tokens) — never the exact figure. */
const ROUND_UNIT = 10_000;

/** A public token burn-down: a banded, rounded, id-free aggregate. */
export interface TokenBurndownPublic {
  /** Whole-percent of budget used, clamped to 0..100 (the bar width). */
  readonly pctUsed: number;
  /** Coarse band for colour + icon (never colour alone at the call site). */
  readonly band: TokenBurndownBand;
  /** Rounded display string, e.g. "≈ 1.24M". Never the exact count. */
  readonly consumedDisplay: string;
  /** Rounded display string for the budget, e.g. "≈ 1.5M". */
  readonly budgetDisplay: string;
  /** Human band label for the sr-only / aria fallback. */
  readonly bandLabel: string;
}

const BAND_LABEL: Record<TokenBurndownBand, string> = {
  ok: "within budget",
  warn: "near budget",
  exhausted: "over budget",
};

/** Round a count to the coarse public unit (fail-safe: non-finite/negative → 0). */
function roundCoarse(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / ROUND_UNIT) * ROUND_UNIT;
}

/** Render a coarse count as a compact "≈ 1.24M" / "≈ 240K" string. */
function coarseDisplay(n: number): string {
  const rounded = roundCoarse(n);
  if (rounded <= 0) return "≈ 0";
  if (rounded >= 1_000_000) {
    return `≈ ${(rounded / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  return `≈ ${Math.round(rounded / 1000)}K`;
}

/**
 * Project an illustrative single-tenant aggregate into a public, id-free,
 * banded, coarsely-rounded burn-down.
 *
 * Pure and deterministic. A non-positive or non-finite budget yields a safe
 * "ok / 0%" result (a public view never shows a misleading or NaN figure).
 */
export function projectTokenBurndownTransparency(
  sample: TokenBurndownTransparencySample,
): TokenBurndownPublic {
  const consumed = Number.isFinite(sample.consumed) && sample.consumed > 0 ? sample.consumed : 0;
  const budget = Number.isFinite(sample.budget) && sample.budget > 0 ? sample.budget : 0;

  const fraction = budget > 0 ? consumed / budget : 0;
  const pctUsed = Math.min(100, Math.max(0, Math.round(fraction * 100)));

  let band: TokenBurndownBand;
  if (budget > 0 && consumed >= budget) band = "exhausted";
  else if (budget > 0 && fraction >= WARN_FRACTION) band = "warn";
  else band = "ok";

  return {
    pctUsed,
    band,
    consumedDisplay: coarseDisplay(consumed),
    budgetDisplay: coarseDisplay(budget),
    bandLabel: BAND_LABEL[band],
  };
}
