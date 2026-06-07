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
