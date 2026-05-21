/**
 * {{className}} — PolicyBundle.
 *
 * Exercises four Decision outcomes against a deployment-approval surface:
 *
 *   - ESCALATE             : production deploys without prior approval
 *   - REQUEST_CONFIRMATION : rollback is destructive — operator must confirm
 *   - REWRITE              : rampPercent > 100 gets clamped
 *   - EXECUTE              : approved staging/production deploys, confirmed rollback
 *
 * Order matters: REWRITE runs first so downstream guards may assume a
 * sane ramp percent.
 */

import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionEscalate,
  decisionExecute,
  decisionRequestConfirmation,
  decisionRewrite,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  MAX_RAMP_PERCENT,
  {{className}}TaintPolicy,
  type {{className}}IntentKind,
  type {{className}}State,
} from "./types.js";

type {{className}}Guard = Guard<{{className}}IntentKind, unknown, {{className}}State>;

// ─── Business guards ───────────────────────────────────────────────────────

/**
 * REWRITE: clamp ramp percent to 100. Built inline rather than via
 * `createRewriteGuard` because the cap is a constant, not state-derived.
 */
const clampRampPercent: {{className}}Guard = nameGuard(
  "clampRampPercent",
  (envelope) => {
    if (envelope.kind !== "{{intentPrefix}}.deployment.request") return null;
    const payload = envelope.payload as {
      readonly sha: string;
      readonly rampPercent: number;
    };
    if (payload.rampPercent <= MAX_RAMP_PERCENT) return null;
    const rewritten = buildEnvelope({
      kind: envelope.kind,
      payload: { ...payload, rampPercent: MAX_RAMP_PERCENT },
      actor: envelope.actor,
      taint: envelope.taint,
      nonce: envelope.nonce,
      createdAt: envelope.createdAt,
    });
    return decisionRewrite(
      rewritten,
      "Ramp percent clamped to 100.",
      [
        basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
          field: "rampPercent",
          requested: payload.rampPercent,
          cappedTo: MAX_RAMP_PERCENT,
        }),
      ],
    );
  },
);

/**
 * ESCALATE: production deploys without `state.lastApprovedSha` matching
 * the requested SHA require supervisor sign-off. Staging is unrestricted.
 */
const escalateProductionDeploy: {{className}}Guard = nameGuard(
  "escalateProductionDeploy",
  (envelope, state) => {
    if (envelope.kind !== "{{intentPrefix}}.deployment.request") return null;
    if (state.environment !== "production") return null;
    const { sha } = envelope.payload as { sha: string };
    if (state.lastApprovedSha === sha) return null;
    return decisionEscalate(
      "supervisor",
      `Production deploy of ${sha} requires supervisor approval (no matching prior approval).`,
      [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, {
          rule: "production_deploy_requires_prior_approval",
          requestedSha: sha,
          lastApprovedSha: state.lastApprovedSha ?? null,
        }),
      ],
    );
  },
);

/**
 * REQUEST_CONFIRMATION: rollback is destructive — surface a confirmation
 * prompt to the operator before the runtime executes.
 */
const requestConfirmRollback: {{className}}Guard = nameGuard(
  "requestConfirmRollback",
  (envelope, state) => {
    if (envelope.kind !== "{{intentPrefix}}.deployment.rollback") return null;
    const { targetSha } = envelope.payload as { targetSha: string };
    return decisionRequestConfirmation(
      `Roll ${state.environment} back from ${state.currentVersion} to ${targetSha}? This is destructive.`,
      [
        basis("business", BASIS_CODES.business.RULE_SATISFIED, {
          rule: "destructive_action_requires_confirmation",
          targetSha,
          fromVersion: state.currentVersion,
        }),
      ],
    );
  },
);

// ─── EXECUTE guards ────────────────────────────────────────────────────────

const executeApprovedDeploy: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.deployment.request") return null;
  // Staging is always allowed once REWRITE + ESCALATE have had a chance.
  // Production reaches here only when state.lastApprovedSha === sha.
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      environment: state.environment,
    }),
  ]);
};

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const {{className}}PolicyBundle: PolicyBundle<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = {
  stateGuards: [],
  authGuards: [],
  taint: {{className}}TaintPolicy,
  business: [
    clampRampPercent,
    escalateProductionDeploy,
    requestConfirmRollback,
    executeApprovedDeploy,
  ],
  /**
   * Fail-safe: any unmatched deployment intent denies. Rollback that
   * isn't confirmed never reaches EXECUTE via this default — adopters
   * compose a `confirmedRollbackHandler` upstream that reissues with a
   * confirmation receipt the kernel substitutes with EXECUTE.
   */
  default: "REFUSE",
};
