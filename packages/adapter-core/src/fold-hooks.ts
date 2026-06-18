/**
 * FoldHooks (decision L4 / ADR-138) — the sanctioned place to wire post-turn
 * state folds and to compose metadata providers.
 *
 * The single biggest replay hazard is routing a decision input through the wrong
 * seam (e.g. MemoryStore instead of state S). Making the correct path the obvious
 * path is the cheapest mitigation: adopters fold ALL post-turn signals
 * (onTokenUsage → tokensConsumed, foldSessionRiskScore → S.sessionRisk,
 * break-glass grant → S.grants, …) through one combinator into the NEXT
 * SendInput.state, out of the decision path.
 *
 * Both helpers are pure and fold-AGNOSTIC: they bake in no specific fold, so
 * there is no dependency on any particular finding's shape.
 */
import type { AuditRecord } from "@adjudicate/core";

/** A post-turn fold: derive the next state from the previous state + turn result. */
export type Fold<S, R> = (prevState: S, turnResult: R) => S;

/**
 * Left-to-right fold composition: `composeFolds(a, b)(s, r) === b(a(s, r), r)`.
 * Each fold sees the previous fold's output. Returns `prevState` unchanged when
 * given no folds.
 */
export function composeFolds<S, R>(...folds: ReadonlyArray<Fold<S, R>>): Fold<S, R> {
  return (prevState, turnResult) => folds.reduce((s, f) => f(s, turnResult), prevState);
}

/** A post-decision, hash-excluded metadata provider (the adjudicateAndAudit seam). */
export type MetadataProvider = (record: AuditRecord) => Readonly<Record<string, unknown>> | undefined;

/**
 * Merge several metadata providers into the ONE `metadataProvider` slot
 * (§2.3 conflict 5 — e.g. hallucination scoring + PII SHADOW both want it).
 * Later providers' keys win on collision. Returns `undefined` when every
 * provider abstains, so clean records keep a byte-identical auditHash pre-image.
 */
export function composeMetadataProviders(
  ...providers: ReadonlyArray<MetadataProvider>
): MetadataProvider {
  return (record) => {
    let merged: Record<string, unknown> | undefined;
    for (const p of providers) {
      const m = p(record);
      if (m !== undefined) merged = { ...(merged ?? {}), ...m };
    }
    return merged;
  };
}
