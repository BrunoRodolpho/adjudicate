/**
 * {{className}} — PolicyBundle.
 *
 * Exercises four Decision outcomes against a multi-stage approval surface:
 *
 *   - REFUSE  : approver.id === request.requestedBy (no self-approval)
 *   - ESCALATE: amount at/above the supervisor threshold
 *   - DEFER   : `approval.request` parks awaiting `approval.granted`
 *   - EXECUTE : non-self approve/deny on a pending request
 *
 * The TaintPolicy in `./types.ts` ensures approve/deny intents only
 * flow from TRUSTED actors.
 */

import {
  basis,
  BASIS_CODES,
  decisionExecute,
  decisionRefuse,
  refuse,
  type PolicyBundle,
} from "@adjudicate/core";
import { nameGuard, type Guard } from "@adjudicate/core/kernel";
import {
  createEscalateGuard,
  createStateDeferGuard,
} from "@adjudicate/primitives";
import {
  APPROVAL_GRANTED_SIGNAL,
  APPROVAL_DEFAULT_DEFER_TIMEOUT_MS,
  ESCALATE_AMOUNT_THRESHOLD,
  {{className}}TaintPolicy,
  type {{className}}IntentKind,
  type {{className}}State,
} from "./types.js";

type {{className}}Guard = Guard<{{className}}IntentKind, unknown, {{className}}State>;

// ─── State guards ──────────────────────────────────────────────────────────

/**
 * REFUSE: the approver cannot approve their own request. Separation of
 * duties — runs as a state guard so it fires before any business logic.
 */
const noSelfApproval: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.approval.approve") return null;
  if (state.request === null) return null;
  if (state.approver.id !== state.request.requestedBy) return null;
  return decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "{{intentPrefix}}.approval.self_approval_forbidden",
      "An approver may not approve their own request.",
      `approverId=${state.approver.id} requestedBy=${state.request.requestedBy}`,
    ),
    [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        rule: "separation_of_duties",
        approverId: state.approver.id,
        requestedBy: state.request.requestedBy,
      }),
    ],
  );
};

// ─── Business guards ───────────────────────────────────────────────────────

/**
 * ESCALATE: requests at/above the supervisor threshold cannot be locally
 * approved. Uses the Layer-2 `createEscalateGuard` factory.
 */
const escalateAboveThreshold: {{className}}Guard = nameGuard(
  "escalateAboveThreshold",
  createEscalateGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.approval.approve",
    extract: (_env, state) => (state.request ? state.request.amount : null),
    threshold: ESCALATE_AMOUNT_THRESHOLD,
    comparator: ">=",
    to: "supervisor",
    reason: (amount) =>
      `Amount of ${amount} requires supervisor approval.`,
  }),
);

/**
 * DEFER: `approval.request` parks until a supervisor fires
 * `APPROVAL_GRANTED_SIGNAL` (or denies via separate intent).
 */
const deferUntilApproved: {{className}}Guard = nameGuard(
  "deferUntilApproved",
  createStateDeferGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.approval.request",
    signal: APPROVAL_GRANTED_SIGNAL,
    timeoutMs: APPROVAL_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_supervisor_approval",
        waitFor: APPROVAL_GRANTED_SIGNAL,
      }),
    ],
  }),
);

// ─── EXECUTE guards ────────────────────────────────────────────────────────

const executeApprove: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.approval.approve") return null;
  if (state.request === null || state.request.status !== "pending") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      requestId: state.request.id,
    }),
  ]);
};

const executeDeny: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.approval.deny") return null;
  if (state.request === null || state.request.status !== "pending") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      requestId: state.request.id,
    }),
  ]);
};

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const {{className}}PolicyBundle: PolicyBundle<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = {
  stateGuards: [noSelfApproval],
  authGuards: [],
  taint: {{className}}TaintPolicy,
  business: [
    escalateAboveThreshold,
    deferUntilApproved,
    executeApprove,
    executeDeny,
  ],
  default: "REFUSE",
};
