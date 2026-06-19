/**
 * @adjudicate/pack-deployments-approval — domain types.
 *
 * Real Pack #3 (after PIX and KYC). Exists to exercise the corners of the
 * Decision algebra that PIX and KYC under-emphasise: human approval gates
 * (ESCALATE) and destructive-action confirmation (REQUEST_CONFIRMATION).
 *
 * Three intent kinds:
 *
 *   - `deployment.approval.request` — UNTRUSTED. LLM or operator proposes a
 *     deploy. Staging EXECUTEs; production ESCALATEs unless an
 *     approval-resolve receipt is supplied.
 *
 *   - `deployment.rollback.execute` — UNTRUSTED. Destructive — the kernel
 *     REQUEST_CONFIRMATIONs before any rollback against production.
 *
 *   - `deployment.approval.resolve` — TRUSTED. Approver-side intent that
 *     records the human decision; the matching request can then EXECUTE.
 */

import type { AuthorityGraphStore } from "@adjudicate/core";
import { createSystemTaintPolicy } from "@adjudicate/primitives";

export type DeploymentIntentKind =
  | "deployment.approval.request"
  | "deployment.rollback.execute"
  | "deployment.approval.resolve";

export type DeploymentEnvironment = "staging" | "production";

// ── Payloads ────────────────────────────────────────────────────────────

export interface DeploymentApprovalRequestPayload {
  readonly service: string;
  readonly gitSha: string;
  readonly environment: DeploymentEnvironment;
  /** Optional rollout ramp (1–100). REWRITE-clamped if outside the policy cap. */
  readonly rampPercent?: number;
  // ── Release-gating extensions (Item 14) ────────────────────────────────
  /** AI eval / regression score (0–100). Below the threshold → ESCALATE. */
  readonly aiEvalScore?: number;
  /** Deployment region; carbon-clamped (REWRITE) to the greenest eligible region. */
  readonly region?: string;
  /** Identity of the AI model bundled in this release (e.g. "model-x@3"). */
  readonly modelId?: string;
  /** Version of the prompt template bundled in this release. */
  readonly promptVersion?: string;
}

export interface DeploymentRollbackExecutePayload {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  /** Git SHA to roll back to. */
  readonly toGitSha: string;
}

export interface DeploymentApprovalResolvePayload {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly gitSha: string;
  readonly approver: string;
  /** Approver decision; "rejected" REFUSES the matching request. */
  readonly decision: "approved" | "rejected";
}

// ── State ───────────────────────────────────────────────────────────────

export interface DeploymentApproval {
  readonly service: string;
  readonly environment: DeploymentEnvironment;
  readonly gitSha: string;
  readonly approver: string;
  readonly decision: "approved" | "rejected";
  readonly at: string;
  /** Model/prompt the approval authorized — drives the model/prompt-change gate. */
  readonly modelId?: string;
  readonly promptVersion?: string;
}

/**
 * Host-supplied authority context the constitutional authority guard (034) reads
 * from `state`. INJECTED immutable snapshot (index §B/§D): the authority-graph
 * store (032/033) plus the IDOR-closing host-identity seam. OPTIONAL (035 wiring
 * contract): absent ⇒ inert; present ⇒ binding + fail-closed for the mutating
 * UNTRUSTED kinds (`deployment.approval.request`, `deployment.rollback.execute`).
 * See `PixAuthorityContext` (pack-payments-pix) for the identical IDOR residual:
 * `principalOf` resolves the AUTHENTICATED principal from `actor.sessionId` —
 * NEVER from the payload — and its namespace MUST match the authority-graph
 * principal names (034-F2).
 */
export interface DeploymentAuthorityContext {
  /** The injected authority-graph snapshot store (032/033). */
  readonly store: AuthorityGraphStore;
  /**
   * IDOR-closing host-identity seam: AUTHENTICATED principal for a sessionId, or
   * `null` for an unknown/unauthenticated session (the guard then REFUSEs,
   * fail-closed). NEVER read from the payload.
   */
  readonly principalOf?: (sessionId: string) => string | null;
}

export interface DeploymentState {
  /**
   * Approvals keyed by `${environment}/${service}/${gitSha}` — a deployment
   * request consults this to check whether the human gate has been cleared.
   */
  readonly approvals: ReadonlyMap<string, DeploymentApproval>;
  /**
   * OPTIONAL injected authority context (032/033/034). Present ⇒ the authority
   * guard in `authGuards` is binding for mutating UNTRUSTED kinds; absent ⇒
   * inert. See `DeploymentAuthorityContext` for the IDOR residual.
   */
  readonly authority?: DeploymentAuthorityContext;
}

// ── Context ─────────────────────────────────────────────────────────────

export interface DeploymentContext {
  /** Internal account requesting the deploy (e.g., "engineer@example.com"). */
  readonly requesterId: string;
}

// ── Taint policy ────────────────────────────────────────────────────────

/**
 * Resolve intents originate inside the approval system (operator console or
 * webhook from the issue tracker) — TRUSTED. Request and rollback come from
 * the LLM/operator boundary — UNTRUSTED.
 */
export const deploymentTaintPolicy = createSystemTaintPolicy({
  systemOnlyKinds: ["deployment.approval.resolve"],
});

// ── Domain constants ────────────────────────────────────────────────────

/**
 * Maximum ramp percentage the kernel will let an `deployment.approval.request`
 * carry into production on a single shot. Anything above this REWRITEs to
 * `MAX_PRODUCTION_RAMP_PERCENT` so a typo can't push 100% of prod traffic
 * to a new build. Staging has no cap.
 */
export const MAX_PRODUCTION_RAMP_PERCENT = 25;

// ── Release-gating constants (Item 14) ────────────────────────────────────

/** AI eval score below this ESCALATEs the deploy to a human. */
export const REGRESSION_ESCALATE_THRESHOLD = 80;

/**
 * Static carbon ranking by region (lower = greener). MUST stay a frozen
 * constant — never fetch live carbon data inside a guard (that would be I/O in
 * the decision path and break replay determinism). Adopters override by passing
 * a state-derived ranking.
 */
export const REGION_CARBON_RANK: Readonly<Record<string, number>> = Object.freeze({
  "us-west-1": 0,
  "eu-north-1": 1,
  "eu-west-1": 2,
  "us-east-1": 5,
  "ap-southeast-1": 6,
});

/** The greenest region in REGION_CARBON_RANK (lowest rank). */
export function greenestRegion(rank: Readonly<Record<string, number>> = REGION_CARBON_RANK): string {
  let best: string | undefined;
  let bestRank = Infinity;
  for (const [region, r] of Object.entries(rank)) {
    if (r < bestRank) {
      bestRank = r;
      best = region;
    }
  }
  return best ?? "us-west-1";
}

export const GREENEST_REGION = greenestRegion();

/**
 * Data-residency zone per region. The carbon clamp NEVER crosses a zone
 * boundary: a deploy pinned to an EU region is only ever relocated to a greener
 * *EU* region, never to `us-west-1`. Without this, the clamp is a GDPR
 * foot-gun. Adopters MUST classify every region they deploy to; an unclassified
 * region is left untouched (fail-safe — never relocate what we can't classify).
 */
export const REGION_RESIDENCY: Readonly<Record<string, string>> = Object.freeze({
  "us-west-1": "us",
  "us-east-1": "us",
  "eu-north-1": "eu",
  "eu-west-1": "eu",
  "ap-southeast-1": "ap",
});

/**
 * The greenest region in the SAME residency zone as `region`. Returns `region`
 * unchanged when it is already greenest in its zone, when its zone has no
 * greener option, or when the region/zone is unknown (fail-safe — a region we
 * cannot classify is never relocated, so residency is never silently violated).
 */
export function greenestRegionInZone(
  region: string,
  rank: Readonly<Record<string, number>> = REGION_CARBON_RANK,
  residency: Readonly<Record<string, string>> = REGION_RESIDENCY,
): string {
  const zone = residency[region];
  if (zone === undefined) return region; // unknown region → never relocate
  let best = region;
  let bestRank = rank[region] ?? Infinity;
  for (const [r, score] of Object.entries(rank)) {
    if (residency[r] === zone && score < bestRank) {
      bestRank = score;
      best = r;
    }
  }
  return best;
}

/** Build the state key for a (service, environment, gitSha) tuple. */
export function approvalKey(
  service: string,
  environment: DeploymentEnvironment,
  gitSha: string,
): string {
  return `${environment}/${service}/${gitSha}`;
}
