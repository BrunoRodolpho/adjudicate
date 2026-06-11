/**
 * Shared guard-walk + name-resolution helpers.
 *
 * Extracted from `analyzers.ts` so the Tier-1 analyzers and the policy
 * manifest builder (`manifest.ts`) resolve guard names identically — one
 * Function.name fallback, one positional-fallback convention, no drift.
 */

import type { PackV0 } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";

/**
 * Guard-array phases, in kernel evaluation order. Taint is NOT here: it is
 * a `TaintPolicy` lookup, not a guard array (see `describePolicyBundle`).
 */
export type Phase = "state" | "auth" | "business";

/** Phases in the order the kernel evaluates them. */
export const PHASES: ReadonlyArray<Phase> = ["state", "auth", "business"];

type AnyGuard = (...args: never[]) => unknown;

interface GuardArrays {
  readonly stateGuards: ReadonlyArray<AnyGuard>;
  readonly authGuards: ReadonlyArray<AnyGuard>;
  readonly business: ReadonlyArray<AnyGuard>;
}

/**
 * Invoke `fn` for every guard in a Pack's policy, in kernel evaluation
 * order (state → auth → business), with its phase and in-phase index.
 */
export function eachGuard<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  fn: (guard: AnyGuard, phase: Phase, index: number) => void,
): void {
  const policy = pack.policy as unknown as GuardArrays;
  policy.stateGuards.forEach((g, i) => fn(g, "state", i));
  policy.authGuards.forEach((g, i) => fn(g, "auth", i));
  policy.business.forEach((g, i) => fn(g, "business", i));
}

/** How a guard's display name was resolved. */
export type NameSource = "metadata" | "function" | "positional";

export interface ResolvedGuardName {
  readonly name: string;
  readonly nameSource: NameSource;
  /** True when neither GuardMetadata.name nor a usable Function.name exists. */
  readonly anonymous: boolean;
}

/**
 * Resolve a stable display name for a guard:
 *   1. `GuardMetadata.name` (set via `withMetadata`/`nameGuard`)  → "metadata"
 *   2. `Function.name` when non-empty                            → "function"
 *   3. `${phase}[${index}]` positional fallback                  → "positional"
 *
 * `anonymous` is true only in case 3 — the guard is invisible to operators
 * reading audit trails until annotated (the AJD-101 condition).
 */
export function resolveGuardName(
  guard: AnyGuard,
  phase: Phase,
  index: number,
): ResolvedGuardName {
  const metaName = readGuardMetadata(guard)?.name;
  if (metaName !== undefined && metaName.length > 0) {
    return { name: metaName, nameSource: "metadata", anonymous: false };
  }
  const fnName =
    typeof (guard as { name?: unknown }).name === "string"
      ? ((guard as { name: string }).name as string)
      : "";
  if (fnName.length > 0) {
    return { name: fnName, nameSource: "function", anonymous: false };
  }
  return { name: `${phase}[${index}]`, nameSource: "positional", anonymous: true };
}

/**
 * Back-compat thin wrapper returning just the resolved name string. Kept so
 * existing analyzers read identically to before the extraction.
 */
export function guardLabel(guard: AnyGuard, phase: Phase, index: number): string {
  return resolveGuardName(guard, phase, index).name;
}
