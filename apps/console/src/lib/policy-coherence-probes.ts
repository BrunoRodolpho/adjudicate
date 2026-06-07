/**
 * Planner probes for the Tier-3 policy-coherence analyzer (ADR-125), shared by
 * the tRPC route and its regression test.
 *
 * deploymentCapabilityPlanner returns `allowedIntents: []` when
 * `context.requesterId` is absent — so probing ONLY with `context: {}` makes the
 * analyzer believe every mutating intent is unreachable and emit false
 * `unreachable_intent` warnings (Item 11). These probes cover the authenticated
 * case so the union of reachable intents reflects real planner behaviour.
 */
export const DEPLOYMENT_POLICY_COHERENCE_PROBES = [
  { label: "unauthenticated", state: { approvals: new Map() }, context: {} },
  { label: "authenticated", state: { approvals: new Map() }, context: { requesterId: "ops@example.com" } },
  {
    label: "authenticated+approvals",
    state: { approvals: new Map([["k", {}]]) },
    context: { requesterId: "ops@example.com" },
  },
] as const;
