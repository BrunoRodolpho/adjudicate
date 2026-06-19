/**
 * AC-007 — a mutating, UNTRUSTED-min intent kind MUST carry an owner predicate.
 *
 * Enforces constitutional invariant §D #8 (index `000_index.md`): "ownership /
 * authority is a constitutional INPUT (not pack-optional); no mutating
 * UNTRUSTED-min kind executes without an owner predicate." Before 035 the
 * shipping packs (`pack-payments-pix`, `pack-access-governance`) violated this:
 * money-moving / grant-mutating kinds were UNTRUSTED-min with `authGuards: []`,
 * so nothing tied the proposal to a resource owner. This static check makes that
 * gap fail conformance.
 *
 * STATIC / STRUCTURAL — like AC-006 (and unlike the fuzz-style AC-001/AC-002),
 * this check does NOT call `adjudicate()`. It inspects three structural surfaces
 * of the pack and is therefore SAMPLING-FREE and SEED-FREE (no PRNG, no clock):
 *
 *   1. `mutating(kind)`  — the MUTATING classifier (see below).
 *   2. `canPropose("UNTRUSTED", kind, pack.policy.taint)` — true iff the kind is
 *      UNTRUSTED-min (the taint gate does NOT short-circuit an UNTRUSTED proposal
 *      of this kind, so the AUTH stage is the only place an owner predicate can
 *      run). A SYSTEM/TRUSTED-min kind is taint-gated and is NOT an AC-007
 *      candidate.
 *   3. `pack.policy.authGuards.length` — the owner-predicate slot. `=== 0` means
 *      no owner predicate exists (`authGuards` is always a `ReadonlyArray`, so
 *      `.length === 0` is the safe emptiness probe — `packages/core/src/pack.ts`).
 *
 * A violation is `mutating(kind) AND UNTRUSTED-min AND authGuards.length === 0`.
 *
 * ## The MUTATING classifier — DEFAULT-MUTATING, fail-closed (human-gated)
 *
 * Resolved by an explicit human gate (`_RUN_STATE.md`, 2026-06-18): a kind is
 * treated as MUTATING **unless** the pack explicitly declares it read-only via
 * `pack.sideEffects[kind] ∈ {"none", "read"}`. An unclassified kind (absent from
 * `sideEffects`, or the whole `sideEffects` map undeclared) is assumed MUTATING.
 *
 * This is the deliberately fail-CLOSED reading. The naive alternative — keying
 * AC-007 off `sideEffects[kind] ∈ {"write","destructive"}` — would pass
 * VACUOUSLY on every current pack, because NO pack declares `sideEffects` (see
 * plan §2/§7). Default-mutating instead fires on the real PIX / access-governance
 * gaps without requiring a `sideEffects` declaration that does not exist, and it
 * cannot be silenced by simply omitting the declaration: to exempt a kind from
 * AC-007 a pack must AFFIRMATIVELY declare it `none`/`read` (a read-only intent),
 * which is exactly the intent class for which an owner predicate is not required.
 *
 * ## Friction-only (§C monotonicity)
 *
 * The check adds friction (a failing conformance result), never relaxes it. It
 * has no authority to authorize anything; it only reports `passed: false` with an
 * operator-facing `details` string naming each offending kind.
 *
 * `run` MUST NOT throw and is deterministic (`ConformanceCheck` contract,
 * `packages/conformance/src/types.ts`): pure structural reads over the pack, no
 * `adjudicate()`, no PRNG, no clock — same `(pack, options)` ⇒ byte-identical
 * result.
 */

import { canPropose } from "@adjudicate/core";
import type { PackV0, SideEffectClass } from "@adjudicate/core";
import type {
  ConformanceCheck,
  ConformanceOptions,
  ConformanceResult,
} from "../types.js";

/** Read-only side-effect classes — the ONLY classes exempt from AC-007. */
const READ_ONLY_CLASSES: ReadonlySet<SideEffectClass> = new Set<SideEffectClass>([
  "none",
  "read",
]);

/**
 * DEFAULT-MUTATING classifier (human-gated, fail-closed): a kind is mutating
 * UNLESS the pack affirmatively declares it read-only (`none`/`read`). An
 * unclassified kind (absent from `sideEffects`, or no `sideEffects` map at all)
 * is treated as mutating.
 */
function isMutating<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  kind: K,
): boolean {
  const declared = pack.sideEffects?.[kind];
  if (declared !== undefined && READ_ONLY_CLASSES.has(declared)) return false;
  return true;
}

export const untrustedMutatingNeedsOwnerCheck: ConformanceCheck = {
  id: "AC-007",
  name: "Mutating, UNTRUSTED-min kinds carry an owner predicate (authGuards non-empty)",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    _options: ConformanceOptions,
  ): ConformanceResult {
    if (pack.intents.length === 0) {
      return {
        id: untrustedMutatingNeedsOwnerCheck.id,
        name: untrustedMutatingNeedsOwnerCheck.name,
        passed: true,
        details: "Pack declares no intents — invariant vacuously holds.",
      };
    }

    // `authGuards` is a policy-wide owner-predicate slot, not per-kind: a single
    // authority guard (scoped internally by its own `matches`) protects every
    // mutating kind. So the structural property is: IF the pack has ANY mutating
    // UNTRUSTED-min kind, THEN authGuards must be non-empty. Compute the set of
    // offending kinds for a precise operator message.
    const hasOwnerPredicate = pack.policy.authGuards.length > 0;
    const offending: K[] = [];
    for (const kind of pack.intents) {
      if (!isMutating(pack, kind)) continue; // read-only kind: exempt
      let untrustedMin: boolean;
      try {
        untrustedMin = canPropose("UNTRUSTED", kind, pack.policy.taint);
      } catch {
        // A throwing taint policy is AC-001/AC-005's concern, not AC-007's;
        // treat an un-probeable kind conservatively as NOT an AC-007 candidate
        // (it cannot be proven UNTRUSTED-min) and move on. `run` must not throw.
        continue;
      }
      if (!untrustedMin) continue; // taint-gated (SYSTEM/TRUSTED-min): not a candidate
      if (!hasOwnerPredicate) offending.push(kind);
    }

    if (offending.length > 0) {
      return {
        id: untrustedMutatingNeedsOwnerCheck.id,
        name: untrustedMutatingNeedsOwnerCheck.name,
        passed: false,
        details:
          `Pack "${pack.id}" declares mutating, UNTRUSTED-min kind(s) ` +
          `[${offending.map((k) => `"${String(k)}"`).join(", ")}] but ships ` +
          `authGuards: [] (no owner predicate). Constitutional invariant §D #8 ` +
          `requires every mutating UNTRUSTED-min kind to be gated by an owner ` +
          `predicate (wire createAuthorityGuard into policy.authGuards), or mark ` +
          `the kind read-only via sideEffects ("none"/"read") if it performs no ` +
          `mutation.`,
      };
    }

    // Count what we actually exercised so the pass is non-vacuous in the report.
    const candidates = pack.intents.filter(
      (k) =>
        isMutating(pack, k) &&
        (() => {
          try {
            return canPropose("UNTRUSTED", k, pack.policy.taint);
          } catch {
            return false;
          }
        })(),
    );
    return {
      id: untrustedMutatingNeedsOwnerCheck.id,
      name: untrustedMutatingNeedsOwnerCheck.name,
      passed: true,
      details:
        candidates.length > 0
          ? `Verified an owner predicate (authGuards.length=${pack.policy.authGuards.length}) ` +
            `gates ${candidates.length} mutating UNTRUSTED-min kind(s).`
          : `No mutating UNTRUSTED-min kind declared — invariant vacuously holds.`,
    };
  },
};
