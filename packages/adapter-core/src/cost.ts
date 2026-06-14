/**
 * Read-time cost pricing for token-usage telemetry (item 3, follows ADR-135).
 *
 * # Determinism boundary — READ THIS FIRST
 *
 * Price is applied at READ time, NEVER on the stored sample. The
 * `TokenUsageStore` records only integer token counts (clock/RNG-free); a
 * `PriceTable` — which is time-varying and deployment-specific — is folded in
 * here, by a pure function, when a view is rendered. Keeping price off the
 * recorded value preserves the store's determinism boundary: replaying does not
 * depend on what a token cost on any given day, and a price change never
 * rewrites history.
 *
 * This is TELEMETRY math, strictly outside the kernel decision path. Nothing
 * here feeds a Decision.
 */

/**
 * USD price per single token, split by direction. Convert from a vendor's
 * "per 1M tokens" quote by dividing by 1_000_000
 * (e.g. $3 / 1M input -> `inputUsdPerToken: 3 / 1_000_000`).
 */
export interface PriceTable {
  readonly inputUsdPerToken: number;
  readonly outputUsdPerToken: number;
}

/** Pure cost breakdown for a consumption view. */
export interface CostBreakdown {
  readonly inputUsd: number;
  readonly outputUsd: number;
  readonly usd: number;
}

function nonNeg(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Apply a `PriceTable` to a consumption view's split token counts. Pure: no
 * clock, no RNG, no I/O. Counts that were never reported with a provider split
 * (only a `total`) contribute 0 — cost is, by construction, never an
 * over-estimate of the priced-split portion.
 */
export function applyCostTable(
  view: { readonly promptConsumed?: number; readonly completionConsumed?: number },
  price: PriceTable,
): CostBreakdown {
  const inputUsd = nonNeg(view.promptConsumed) * price.inputUsdPerToken;
  const outputUsd = nonNeg(view.completionConsumed) * price.outputUsdPerToken;
  return { inputUsd, outputUsd, usd: inputUsd + outputUsd };
}
