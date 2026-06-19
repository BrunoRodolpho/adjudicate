/**
 * @adjudicate/pack-deployments-approval — PolicyBundle.
 *
 * Three intent kinds × five guard-emitted outcomes (DEFER, ESCALATE,
 * REQUEST_CONFIRMATION, REWRITE, REFUSE) + EXECUTE for the trivial cases.
 *
 * Phases (state → taint → auth → business):
 *
 *   - state: REFUSE on unknown environment / invalid SHA / repeat approval.
 *   - taint: deploymentTaintPolicy gates `deployment.approval.resolve` to
 *            TRUSTED.
 *   - auth: empty here (adopter wires identity gating).
 *   - business:
 *       * DEFER `deployment.approval.request` to staging when ramp > 50%
 *         (a hypothetical CI-percent gate before high-ramp staging).
 *       * REWRITE production ramp > MAX_PRODUCTION_RAMP_PERCENT down to
 *         the cap.
 *       * ESCALATE production deploys without a prior approval.
 *       * REQUEST_CONFIRMATION on every production rollback (the kernel's
 *         intentHash-bound receipt path owns the EXECUTE transition).
 *       * EXECUTE every other valid request.
 *
 * Production-ready rollout patterns (canary, blue/green) are out of scope
 * here — this Pack is the lighthouse for the *decision algebra*, not for
 * the deployment-controller ecosystem.
 */

import {
  basis,
  BASIS_CODES,
  buildEnvelope,
  decisionDefer,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  decisionRequestConfirmation,
  decisionRewrite,
  refuse,
  resolveOwnership,
} from "@adjudicate/core";
import {
  nameGuard,
  type Guard,
  type PolicyBundle,
} from "@adjudicate/core/kernel";
import { createAuthorityGuard, createEscalateGuard } from "@adjudicate/primitives";
import {
  approvalKey,
  deploymentTaintPolicy,
  greenestRegionInZone,
  MAX_PRODUCTION_RAMP_PERCENT,
  REGRESSION_ESCALATE_THRESHOLD,
  type DeploymentApprovalRequestPayload,
  type DeploymentApprovalResolvePayload,
  type DeploymentIntentKind,
  type DeploymentRollbackExecutePayload,
  type DeploymentState,
} from "./types.js";

type DeploymentGuard = Guard<DeploymentIntentKind, unknown, DeploymentState>;

/** Staging deploys with ramp above this DEFER on the CI-green signal. */
export const HIGH_RAMP_THRESHOLD = 50;

/** Wire signal a deferred staging high-ramp deploy resumes on. */
export const DEPLOYMENT_CI_GREEN_SIGNAL = "ci.green";

export const DEPLOYMENT_DEFAULT_DEFER_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// ── State / validation guards ───────────────────────────────────────────

const refuseUnknownEnvironment: DeploymentGuard = (envelope) => {
  if (envelope.kind === "deployment.approval.resolve") {
    const p = envelope.payload as DeploymentApprovalResolvePayload;
    return p.environment === "staging" || p.environment === "production"
      ? null
      : decisionRefuse(
          refuse(
            "STATE",
            "deployment.environment_invalid",
            "Unknown deployment environment.",
          ),
          [],
        );
  }
  const env = (envelope.payload as { environment?: string }).environment;
  if (env === undefined) return null;
  return env === "staging" || env === "production"
    ? null
    : decisionRefuse(
        refuse(
          "STATE",
          "deployment.environment_invalid",
          "Unknown deployment environment.",
        ),
        [],
      );
};

const refuseEmptyGitSha: DeploymentGuard = (envelope) => {
  if (
    envelope.kind === "deployment.approval.request" ||
    envelope.kind === "deployment.approval.resolve"
  ) {
    const p = envelope.payload as { gitSha?: string };
    if (!p.gitSha || p.gitSha.length === 0) {
      return decisionRefuse(
        refuse(
          "STATE",
          "deployment.git_sha_missing",
          "gitSha is required.",
        ),
        [],
      );
    }
  }
  if (envelope.kind === "deployment.rollback.execute") {
    const p = envelope.payload as DeploymentRollbackExecutePayload;
    if (!p.toGitSha || p.toGitSha.length === 0) {
      return decisionRefuse(
        refuse(
          "STATE",
          "deployment.git_sha_missing",
          "toGitSha is required.",
        ),
        [],
      );
    }
  }
  return null;
};

// ── Business guards ─────────────────────────────────────────────────────

// future-primitive: a `createDeferOnCiGate` factory could absorb this and the
// PIX `createStateDeferGuard` pattern. Three Packs is the threshold for
// extraction — log the candidate but write the inline guard for now.
const deferHighRampStaging: DeploymentGuard = nameGuard(
  "deferHighRampStaging",
  (envelope) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.environment !== "staging") return null;
    if ((p.rampPercent ?? 100) <= HIGH_RAMP_THRESHOLD) return null;
    return decisionDefer(
      DEPLOYMENT_CI_GREEN_SIGNAL,
      DEPLOYMENT_DEFAULT_DEFER_TIMEOUT_MS,
      [
        basis("state", BASIS_CODES.state.TRANSITION_VALID, {
          rampPercent: p.rampPercent ?? 100,
        }),
      ],
    );
  },
);

const clampProductionRamp: DeploymentGuard = nameGuard(
  "clampProductionRamp",
  (envelope) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.environment !== "production") return null;
    if ((p.rampPercent ?? 100) <= MAX_PRODUCTION_RAMP_PERCENT) return null;
    const rewritten = buildEnvelope({
      kind: envelope.kind,
      actor: envelope.actor,
      taint: envelope.taint,
      nonce: envelope.nonce,
      createdAt: envelope.createdAt,
      payload: {
        ...p,
        rampPercent: MAX_PRODUCTION_RAMP_PERCENT,
      },
    });
    return decisionRewrite(
      rewritten,
      `Production ramp clamped from ${p.rampPercent ?? 100}% to ${MAX_PRODUCTION_RAMP_PERCENT}%.`,
      [
        basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
          requested: p.rampPercent ?? 100,
          cap: MAX_PRODUCTION_RAMP_PERCENT,
        }),
      ],
    );
  },
);

const escalateProductionWithoutApproval: DeploymentGuard = nameGuard(
  "escalateProductionWithoutApproval",
  (envelope, state) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.environment !== "production") return null;
    const approval = state.approvals.get(
      approvalKey(p.service, p.environment, p.gitSha),
    );
    if (approval && approval.decision === "approved") return null;
    if (approval && approval.decision === "rejected") {
      return decisionRefuse(
        refuse(
          "BUSINESS_RULE",
          "deployment.approval_rejected",
          `Approval rejected by ${approval.approver}.`,
        ),
        [basis("business", BASIS_CODES.business.RULE_VIOLATED)],
      );
    }
    return decisionEscalate(
      "human",
      `Production deploy of ${p.service}@${p.gitSha.slice(0, 8)} requires approval.`,
      [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, {
          service: p.service,
          gitSha: p.gitSha,
        }),
      ],
    );
  },
);

// confirmDestructiveRollback is a REQUEST_CONFIRMATION-only producer. A production
// rollback is destructive, so it always asks for confirmation. The
// REQUEST_CONFIRMATION→EXECUTE transition is owned SOLELY by the kernel's
// intentHash-bound `confirmationReceipt` path (adjudicate-and-audit.ts,
// `receipt.intentHash === envelope.intentHash`) — never by a model-supplied
// payload token. Without a bound receipt the rollback falls through to the
// default REFUSE (the intended fail-closed posture, plan 014).
const confirmDestructiveRollback: DeploymentGuard = nameGuard(
  "confirmDestructiveRollback",
  (envelope) => {
    if (envelope.kind !== "deployment.rollback.execute") return null;
    const p = envelope.payload as DeploymentRollbackExecutePayload;
    if (p.environment !== "production") return null;
    return decisionRequestConfirmation(
      `Confirm rollback of production to ${p.toGitSha.slice(0, 8)}? This is destructive.`,
      [
        basis("business", BASIS_CODES.business.RULE_VIOLATED, {
          environment: p.environment,
        }),
      ],
    );
  },
);

const allowResolve: DeploymentGuard = nameGuard("allowResolve", (envelope) => {
  if (envelope.kind !== "deployment.approval.resolve") return null;
  return decisionExecute([
    basis("business", BASIS_CODES.business.RULE_SATISFIED),
  ]);
});

const allowStagingNoRampOrLowRamp: DeploymentGuard = nameGuard(
  "allowStagingDeploy",
  (envelope) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.environment !== "staging") return null;
    if ((p.rampPercent ?? 100) > HIGH_RAMP_THRESHOLD) return null; // deferred upstream
    return decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("business", BASIS_CODES.business.RULE_SATISFIED),
    ]);
  },
);

const allowApprovedProduction: DeploymentGuard = nameGuard(
  "allowApprovedProduction",
  (envelope, state) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.environment !== "production") return null;
    const approval = state.approvals.get(
      approvalKey(p.service, p.environment, p.gitSha),
    );
    if (!approval || approval.decision !== "approved") return null;
    return decisionExecute([
      basis("state", BASIS_CODES.state.TRANSITION_VALID),
      basis("business", BASIS_CODES.business.RULE_SATISFIED, {
        approver: approval.approver,
      }),
    ]);
  },
);

// ── Release-gating guards (Item 14) ───────────────────────────────────────

/** ESCALATE when the AI eval / regression score drops below the threshold. */
const escalateRegressionScore: DeploymentGuard = nameGuard(
  "escalateRegressionScore",
  createEscalateGuard<DeploymentIntentKind, unknown, DeploymentState>({
    matches: (envelope) => envelope.kind === "deployment.approval.request",
    extract: (envelope) => (envelope.payload as DeploymentApprovalRequestPayload).aiEvalScore,
    threshold: REGRESSION_ESCALATE_THRESHOLD,
    comparator: "<",
    to: "human",
    reason: (value, threshold) => `AI eval score ${value} is below ${threshold}; release escalated.`,
  }),
);

/**
 * REWRITE the deploy region to the greenest region WITHIN THE SAME DATA-RESIDENCY
 * ZONE (carbon budget). Crucially zone-bounded: an `eu-*` deploy is only ever
 * clamped to a greener `eu-*` region, never to `us-west-1` — relocating across a
 * residency boundary would be a GDPR violation. Unknown regions are left alone.
 */
const clampToGreenestRegion: DeploymentGuard = nameGuard("clampToGreenestRegion", (envelope) => {
  if (envelope.kind !== "deployment.approval.request") return null;
  const p = envelope.payload as DeploymentApprovalRequestPayload;
  if (p.region === undefined) return null;
  const greenest = greenestRegionInZone(p.region);
  if (p.region === greenest) return null; // already greenest in its zone (or unknown)
  const rewritten = buildEnvelope({
    kind: envelope.kind,
    actor: envelope.actor,
    taint: envelope.taint, // never lowered/raised
    nonce: envelope.nonce,
    createdAt: envelope.createdAt,
    payload: { ...p, region: greenest },
  });
  return decisionRewrite(rewritten, `Region clamped from ${p.region} to ${greenest} (carbon budget, same residency zone).`, [
    basis("business", BASIS_CODES.business.RULE_SATISFIED, { from: p.region, to: greenest, reason: "carbon_budget" }),
  ]);
});

/** REQUEST_CONFIRMATION when the bundled model/prompt differs from the last approved release. */
const confirmModelOrPromptChange: DeploymentGuard = nameGuard(
  "confirmModelOrPromptChange",
  (envelope, state) => {
    if (envelope.kind !== "deployment.approval.request") return null;
    const p = envelope.payload as DeploymentApprovalRequestPayload;
    if (p.modelId === undefined && p.promptVersion === undefined) return null;
    // Find the most recent approved release for this service+environment.
    // Total-order comparator (equal `at` → 0): a non-total comparator makes the
    // "most recent prior" non-deterministic for tied timestamps, which would put
    // a replay-determinism-sensitive value (the prior model/prompt compared
    // against) at the mercy of V8's unstable sort. Descending by `at`.
    const prior = Array.from(state.approvals.values())
      .filter((a) => a.service === p.service && a.environment === p.environment && a.decision === "approved")
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
    const modelChanged = p.modelId !== undefined && prior?.modelId !== p.modelId;
    const promptChanged = p.promptVersion !== undefined && prior?.promptVersion !== p.promptVersion;
    if (!modelChanged && !promptChanged) return null;
    return decisionRequestConfirmation(
      `Model/prompt changed (model ${prior?.modelId ?? "—"}→${p.modelId ?? "—"}, prompt ${prior?.promptVersion ?? "—"}→${p.promptVersion ?? "—"}). Confirm the release gate?`,
      [basis("business", BASIS_CODES.business.RULE_VIOLATED, { modelChanged, promptChanged })],
    );
  },
);

// ── Authority guard (034/035) ─────────────────────────────────────────────

/**
 * Mutating, UNTRUSTED-min kinds the constitutional authority guard (034) gates:
 * `deployment.approval.request` and `deployment.rollback.execute`.
 * `deployment.approval.resolve` is TRUSTED-only (taint-gated) — not a candidate.
 */
const DEPLOYMENT_AUTHORITY_GATED_KINDS: ReadonlySet<DeploymentIntentKind> =
  new Set<DeploymentIntentKind>([
    "deployment.approval.request",
    "deployment.rollback.execute",
  ]);

/**
 * 035 — wire the constitutional authority guard (034) into deployments-approval
 * `authGuards` (§D #8). The pack previously shipped `authGuards: []` ("adopter
 * wires identity gating"); 035 makes the owner predicate constitutional. The
 * guard reads the INJECTED `state.authority` (032/033); engagement is gated on
 * the host injecting it (documented seam — see `DeploymentAuthorityContext`).
 * When present it is BINDING + fail-closed: it resolves ownership of the deploy
 * target from the injected store via `envelope.resourceRefs` (the host stamps
 * `resourceRefs: { owner: <team/service-owner>, resource: <service> }`) and
 * REFUSEs an unbound declared owner / an absent ref / — via `principalOf` — an
 * authenticated actor who is not that owner, and on any resolver throw. Absent
 * authority ⇒ inert (`null`), the pre-035 posture the scenario/gate tests use.
 */
const enforceDeployOwnership: DeploymentGuard = createAuthorityGuard<
  DeploymentIntentKind,
  unknown,
  DeploymentState
>(
  (envelope, state) => resolveOwnership(state.authority!.store, envelope),
  {
    matches: (envelope, state) =>
      state.authority !== undefined &&
      DEPLOYMENT_AUTHORITY_GATED_KINDS.has(envelope.kind),
    // Fail-closed identity seam (see pix policies): a host that injects authority
    // but no `principalOf` yields `null` ⇒ REFUSE (no bare-binding fallback).
    authenticatedPrincipal: (envelope, state) =>
      state.authority?.principalOf?.(envelope.actor.sessionId) ?? null,
  },
);

// ── The PolicyBundle ────────────────────────────────────────────────────

export const deploymentPolicyBundle: PolicyBundle<
  DeploymentIntentKind,
  unknown,
  DeploymentState
> = {
  stateGuards: [refuseUnknownEnvironment, refuseEmptyGitSha],
  // 035 — constitutional authority guard (034) gating mutating UNTRUSTED kinds
  // (§D #8). After taint, before business. Inert without injected authority;
  // binding + fail-closed when the host injects it.
  authGuards: [enforceDeployOwnership],
  taint: deploymentTaintPolicy,
  business: [
    allowResolve,
    // Release gates (Item 14) — a failed eval escalates before any clamp;
    // region carbon-clamp and model/prompt confirm precede the approval gates.
    escalateRegressionScore,
    deferHighRampStaging,
    clampProductionRamp,
    clampToGreenestRegion,
    confirmModelOrPromptChange,
    escalateProductionWithoutApproval,
    confirmDestructiveRollback,
    allowStagingNoRampOrLowRamp,
    allowApprovedProduction,
  ],
  default: "REFUSE",
};
