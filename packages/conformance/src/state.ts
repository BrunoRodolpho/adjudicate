/**
 * Harness state-construction helper.
 *
 * Every conformance check needs to invoke `adjudicate()` against the
 * Pack's policy, which means supplying a `state` argument. The harness
 * does not know the Pack's domain — `pix` carries a `Map`, an ordering
 * Pack might carry an `Order[]` array, a billing Pack might carry a
 * nested record — and constructing meaningful synthetic state per Pack
 * would require Pack-specific knowledge the harness deliberately
 * avoids.
 *
 * Resolution: when a Pack provides `rehydrateState`, the harness calls
 * `rehydrateState({})`. By convention (documented on PackV0) rehydrate
 * is permissive on input — absent/malformed fields are treated as
 * empty containers. For PIX this produces `{ charges: new Map() }`
 * (the empty-state shape Pack guards expect). For Packs without
 * `rehydrateState`, the harness falls back to `{}` — guards that
 * crash on the empty object will trigger `guard_panic` REFUSEs, which
 * the harness treats as harness-induced and exempts from the basis
 * vocabulary check.
 *
 * This is the same posture the framework's `simulate` CLI and audit
 * replay take: trust the Pack's contract, don't guess.
 */

import type { PackV0 } from "@adjudicate/core";

export function emptyStateFor<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
): S {
  if (typeof pack.rehydrateState === "function") {
    return pack.rehydrateState({});
  }
  return {} as S;
}
