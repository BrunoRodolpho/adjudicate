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

import { sha256Canonical } from "@adjudicate/canonical";
import {
  readGuardCodeArtifact,
  readGuardMetadata,
  type Guard,
  type GuardCodeArtifact,
  type GuardMetadata,
  type PolicyBundle,
} from "./policy.js";

export type PolicyPhase = "state" | "taint" | "auth" | "business";

/**
 * Optional per-guard code-artifact digest (081). When a guard exposed a
 * `GuardCodeArtifact` (closure-captured caps + predicate source) via
 * `attachGuardCodeArtifact`, this is `sha256Canonical(codeArtifact)` so the
 * ConfigSeal binds the *executable* surface, not just the declared metadata.
 * Absent for guards with no artifact to pin (back-compatible: the descriptor
 * shape for metadata-only guards is otherwise unchanged).
 *
 * Pure: sha256-over-canonical-JSON via `@adjudicate/canonical` (the single
 * invariant-#4-compatible encoder), no clock / RNG / IO. Deterministic — the
 * same artifact always yields the same digest, so re-extraction is
 * byte-identical (§D-inv-5).
 */
export type GuardDescriptor =
  | {
      readonly kind: "named";
      readonly metadata: GuardMetadata;
      readonly codeDigest?: string;
    }
  | { readonly kind: "anonymous"; readonly codeDigest?: string };

export interface PolicyPhaseDescriptor {
  readonly phase: PolicyPhase;
  readonly guards: ReadonlyArray<GuardDescriptor>;
}

export interface PolicyBundleDescriptor {
  readonly default: "REFUSE" | "EXECUTE";
  readonly phases: ReadonlyArray<PolicyPhaseDescriptor>;
}

/**
 * Digest a guard's executable surface (081). `sha256Canonical` over the
 * attached `GuardCodeArtifact`, or `undefined` when the guard exposed none.
 * Canonicalization makes the digest key-order-independent and deterministic.
 */
function digestGuardCode(artifact: GuardCodeArtifact | undefined): string | undefined {
  if (artifact === undefined) return undefined;
  return sha256Canonical(artifact);
}

function describeGuard<K extends string, P, S>(
  guard: Guard<K, P, S>,
): GuardDescriptor {
  const fn = guard as unknown as (...args: never[]) => unknown;
  const metadata = readGuardMetadata(fn);
  const codeDigest = digestGuardCode(readGuardCodeArtifact(fn));
  if (metadata === undefined) {
    return codeDigest === undefined
      ? { kind: "anonymous" }
      : { kind: "anonymous", codeDigest };
  }
  return codeDigest === undefined
    ? { kind: "named", metadata }
    : { kind: "named", metadata, codeDigest };
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
