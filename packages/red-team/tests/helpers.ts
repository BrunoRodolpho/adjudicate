import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  refuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";
import type { RedTeamPack } from "../src/index.js";

/**
 * A small, fail-closed stub pack: one user kind (REFUSEs unknown payloads) and
 * one system-only kind (TRUSTED minimum). Defends every vector.
 */
export function strictStubPack(): RedTeamPack {
  const policy: PolicyBundle<string, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: createSystemTaintPolicy({ systemOnlyKinds: ["demo.system.callback"] }),
    business: [
      (env) =>
        env.kind === "demo.user.action"
          ? decisionRefuse(
              refuse("BUSINESS_RULE", "demo.not_found", "Not found."),
              [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
            )
          : null,
    ],
    default: "REFUSE",
  };
  return {
    id: "stub-strict",
    intents: ["demo.user.action", "demo.system.callback"],
    policy,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: (raw) => raw ?? {},
  };
}

/**
 * 043 — a pack that declares an UNTRUSTED-min MUTATING kind (`demo.user.action`)
 * as ORIGIN-REQUIRED, and whose business stage would otherwise EXECUTE it. The
 * trust-rank floor passes (1>=1) so the ONLY defense for a contaminated proposal
 * of `demo.user.action` is the 043 kernel origin branch. Used to prove the
 * `read_inject_intent` vector non-vacuously: a contaminating-origin proposal is
 * REFUSEd at the taint gate (propagation_violation), a clean origin EXECUTEs.
 *
 * The planner exposes a READ tool so the laundering source is the real
 * `visibleReadTools` seam, not the synthetic fallback.
 */
export function originRequiredStubPack(): RedTeamPack {
  const policy: PolicyBundle<string, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    taint: createSystemTaintPolicy({
      systemOnlyKinds: ["demo.system.callback"],
      // demo.user.action is UNTRUSTED-min (rank floor always passes) but
      // origin-required — only the 043 branch can stop a contaminated proposal.
      originRequiredKinds: ["demo.user.action"],
    }),
    // A permissive business stage that would EXECUTE the mutating kind, so ONLY
    // the taint origin branch can stop the contaminated proposal (non-vacuous).
    business: [() => null],
    default: "EXECUTE",
  };
  return {
    id: "stub-origin-required",
    intents: ["demo.user.action", "demo.system.callback"],
    policy,
    planner: {
      plan: () => ({
        visibleReadTools: ["knowledge_base_search"],
        allowedIntents: ["demo.user.action"],
      }),
    },
    rehydrateState: (raw) => raw ?? {},
  };
}

/**
 * A deliberately-leaky pack: fail-OPEN default and a permissive taint policy, so
 * adversarial intents reach EXECUTE — the harness must catch the escapes.
 */
export function leakyStubPack(): RedTeamPack {
  const policy: PolicyBundle<string, unknown, unknown> = {
    stateGuards: [],
    authGuards: [],
    // Mis-declares a system-only kind as UNTRUSTED-tolerant (the bug).
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [(env) => (env.kind ? decisionExecute([]) : null)],
    default: "EXECUTE",
  };
  return {
    id: "stub-leaky",
    intents: ["demo.user.action", "demo.system.callback"],
    policy,
    planner: {
      plan: () => ({ visibleReadTools: [], allowedIntents: ["demo.user.action"] }),
    },
    rehydrateState: (raw) => raw ?? {},
  };
}
