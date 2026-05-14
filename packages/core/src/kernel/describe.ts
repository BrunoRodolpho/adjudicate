/**
 * describePolicyBundle — JSON-serialisable introspection of a PolicyBundle.
 *
 * Pure read-only walk over the guard arrays. Reads `GuardMetadata` attached
 * via `withMetadata`; emits `{ kind: "anonymous" }` for guards without it.
 * The taint phase is rendered as a single virtual descriptor so consumers
 * can render all four phases uniformly — the taint object is a
 * `TaintPolicy` (kind→Taint lookup), not a guard array, so its descriptor
 * carries no name/author/since.
 *
 * Used by:
 *   - `apps/console` governance visualiser (shows the policy structure)
 *   - `apps/web` GuardMetadata force-graph
 *   - analyzer tooling that wants to traverse policy without invoking guards
 *
 * Per ADR-105: metadata is permanently optional. Consumers MUST handle
 * `{ kind: "anonymous" }` and `{ kind: "named" }` without metadata.description.
 */

import {
  readGuardMetadata,
  type Guard,
  type GuardMetadata,
  type PolicyBundle,
} from "./policy.js";

export type PolicyPhase = "state" | "taint" | "auth" | "business";

export type GuardDescriptor =
  | { readonly kind: "named"; readonly metadata: GuardMetadata }
  | { readonly kind: "anonymous" };

export interface PolicyPhaseDescriptor {
  readonly phase: PolicyPhase;
  readonly guards: ReadonlyArray<GuardDescriptor>;
}

export interface PolicyBundleDescriptor {
  readonly default: "REFUSE" | "EXECUTE";
  readonly phases: ReadonlyArray<PolicyPhaseDescriptor>;
}

function describeGuard<K extends string, P, S>(
  guard: Guard<K, P, S>,
): GuardDescriptor {
  const metadata = readGuardMetadata(
    guard as unknown as (...args: never[]) => unknown,
  );
  if (metadata === undefined) return { kind: "anonymous" };
  return { kind: "named", metadata };
}

function describeGuards<K extends string, P, S>(
  guards: ReadonlyArray<Guard<K, P, S>>,
): ReadonlyArray<GuardDescriptor> {
  return guards.map(describeGuard);
}

export function describePolicyBundle<K extends string, P, S>(
  bundle: PolicyBundle<K, P, S>,
): PolicyBundleDescriptor {
  return {
    default: bundle.default,
    phases: [
      { phase: "state", guards: describeGuards(bundle.stateGuards) },
      // Taint is a TaintPolicy object, not a guard array — we render it as a
      // single anonymous descriptor so the phase appears in the same shape as
      // the others. Consumers wanting per-kind taint detail can read
      // `bundle.taint.minimumFor(kind)` directly; that's outside this
      // descriptor's contract.
      { phase: "taint", guards: [{ kind: "anonymous" }] },
      { phase: "auth", guards: describeGuards(bundle.authGuards) },
      { phase: "business", guards: describeGuards(bundle.business) },
    ],
  };
}
