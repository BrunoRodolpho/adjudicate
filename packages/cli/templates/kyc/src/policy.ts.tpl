/**
 * {{className}} — PolicyBundle.
 *
 * Exercises four Decision outcomes against a KYC session lifecycle:
 *
 *   - REFUSE  : `validateSessionExists` for non-start intents on a null session
 *   - ESCALATE: `escalateLowScore` for vendor scores below threshold
 *   - DEFER   : `deferOnStart` and `deferOnUpload` park awaiting signals
 *   - EXECUTE : positive guards for vendor.callback and complete
 *
 * The TaintPolicy in `./types.ts` enforces `vendor.callback` as TRUSTED-
 * only (system-event from the vendor webhook).
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
  ESCALATE_LOW_SCORE_THRESHOLD,
  KYC_DEFAULT_DEFER_TIMEOUT_MS,
  KYC_DOCUMENTS_UPLOADED_SIGNAL,
  KYC_VENDOR_COMPLETED_SIGNAL,
  {{className}}TaintPolicy,
  type {{className}}IntentKind,
  type {{className}}State,
} from "./types.js";

type {{className}}Guard = Guard<{{className}}IntentKind, unknown, {{className}}State>;

// ─── State guards ──────────────────────────────────────────────────────────

/**
 * REFUSE: every non-start kind requires an existing session. Runs as a
 * state guard so it fires before any business logic.
 */
const validateSessionExists: {{className}}Guard = (envelope, state) => {
  if (envelope.kind === "{{intentPrefix}}.kyc.start") return null;
  if (state.session !== null) return null;
  return decisionRefuse(
    refuse(
      "STATE",
      "{{intentPrefix}}.kyc.session_missing",
      "There's no active KYC session to act on.",
      `kind=${envelope.kind}`,
    ),
    [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
        kind: envelope.kind,
        reason: "no_active_session",
      }),
    ],
  );
};

// ─── Business guards ───────────────────────────────────────────────────────

/**
 * ESCALATE: vendor score BELOW the threshold demands manual review.
 * `comparator: "<"` because the boundary should ESCALATE strictly below
 * the threshold (a score equal to the threshold passes).
 */
const escalateLowScore: {{className}}Guard = nameGuard(
  "escalateLowScore",
  createEscalateGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.kyc.vendor.callback",
    extract: (env) => (env.payload as { score: number }).score,
    threshold: ESCALATE_LOW_SCORE_THRESHOLD,
    comparator: "<",
    to: "human",
    reason: (score) =>
      `Vendor score ${score} is below the manual-review threshold.`,
  }),
);

/**
 * DEFER: `kyc.start` parks until the user uploads documents and the
 * runtime fires `KYC_DOCUMENTS_UPLOADED_SIGNAL`.
 */
const deferOnStart: {{className}}Guard = nameGuard(
  "deferOnStart",
  createStateDeferGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.kyc.start",
    signal: KYC_DOCUMENTS_UPLOADED_SIGNAL,
    timeoutMs: KYC_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_user_document_upload",
        waitFor: KYC_DOCUMENTS_UPLOADED_SIGNAL,
      }),
    ],
  }),
);

/**
 * DEFER: `document.upload` parks until the vendor completes verification
 * and fires `KYC_VENDOR_COMPLETED_SIGNAL`.
 */
const deferOnUpload: {{className}}Guard = nameGuard(
  "deferOnUpload",
  createStateDeferGuard<{{className}}IntentKind, unknown, {{className}}State>({
    matches: (env) => env.kind === "{{intentPrefix}}.kyc.document.upload",
    signal: KYC_VENDOR_COMPLETED_SIGNAL,
    timeoutMs: KYC_DEFAULT_DEFER_TIMEOUT_MS,
    basis: [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        reason: "awaiting_vendor_completion",
        waitFor: KYC_VENDOR_COMPLETED_SIGNAL,
      }),
    ],
  }),
);

// ─── EXECUTE guards ────────────────────────────────────────────────────────

const executeVendorCallback: {{className}}Guard = (envelope) => {
  if (envelope.kind !== "{{intentPrefix}}.kyc.vendor.callback") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
    }),
  ]);
};

const executeComplete: {{className}}Guard = (envelope, state) => {
  if (envelope.kind !== "{{intentPrefix}}.kyc.complete") return null;
  if (state.session === null || state.session.status !== "completed") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED, {
      kind: envelope.kind,
      sessionId: state.session.id,
    }),
  ]);
};

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const {{className}}PolicyBundle: PolicyBundle<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = {
  stateGuards: [validateSessionExists],
  authGuards: [],
  taint: {{className}}TaintPolicy,
  business: [
    escalateLowScore,
    deferOnStart,
    deferOnUpload,
    executeVendorCallback,
    executeComplete,
  ],
  default: "REFUSE",
};
