/**
 * 043 — a CLI fixture pack that declares an UNTRUSTED-min MUTATING kind
 * (`memo.write`) as ORIGIN-REQUIRED. Used by the `red-team` CLI smoke test to
 * exercise the `read_inject_intent` vector end-to-end: a contaminating-origin
 * proposal of `memo.write` (whose trust-rank floor always passes, 1>=1) is
 * REFUSEd by the kernel's 043 origin branch.
 *
 * Minimal Pack shape the CLI loader requires: `contract` + `intents` + `policy`.
 * A planner exposes a READ tool so the laundering source is the real
 * `visibleReadTools` seam.
 */

import type { PolicyBundle } from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";

const policy: PolicyBundle<string, unknown, unknown> = {
  stateGuards: [],
  authGuards: [],
  taint: createSystemTaintPolicy({
    systemOnlyKinds: ["memo.system_event"],
    // memo.write is UNTRUSTED-min (rank floor always passes) but origin-required
    // — only the 043 kernel origin branch stops a contaminated proposal.
    originRequiredKinds: ["memo.write"],
  }),
  // A permissive business stage that would EXECUTE the mutating kind, so ONLY the
  // 043 origin branch can stop the laundered proposal (non-vacuous).
  business: [() => null],
  default: "EXECUTE",
};

export const originRequiredPack = {
  id: "fixture-origin-required",
  contract: "v0" as const,
  intents: ["memo.write", "memo.system_event"],
  policy,
  planner: {
    plan: () => ({
      visibleReadTools: ["knowledge_base_search"],
      allowedIntents: ["memo.write"],
    }),
  },
  rehydrateState: (raw: unknown) => raw ?? {},
};

export default originRequiredPack;
