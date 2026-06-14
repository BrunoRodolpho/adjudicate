/**
 * `adjudicate demo` — bundled vacation-approval Pack.
 *
 * Self-contained PackV0 the `demo` command loads through the existing
 * `simulate --scenarios` path. It is a neutral hello-world: a small leave-
 * approval workflow whose six guards each steer the kernel down one of the
 * six Decision kinds, so `demo` renders the full taxonomy with no API key,
 * no network, and no Docker.
 *
 * This module is bundled UNDER the CLI (compiled into `dist/` alongside
 * the bin), not imported from `examples/` — `demo` must not depend on a
 * private example package. It is shaped after `examples/vacation-approval`
 * but stands alone. Its six scenario fixtures live under
 * `packages/cli/templates/demo/scenarios/` (shipped via the package's
 * `files` and resolved relative to the bin).
 *
 * Guard → Decision map (kernel order: state -> taint -> auth -> business):
 *
 *   requestRequired          -> REFUSE   (STATE)     approve/cancel with no request
 *   clampDuration            -> REWRITE              durationDays beyond policy max
 *   cancelWindowConfirmation -> REQUEST_CONFIRMATION cancel within 24h of start
 *   noSelfApproval           -> ESCALATE             manager approving themselves
 *   sufficientBalance        -> REFUSE   (BUSINESS)  request exceeds PTO balance
 *   deferIfNeedsApproval     -> DEFER                employee request awaits manager
 *   executeManagerRequest    -> EXECUTE              manager self-files, in policy
 *
 * The bundle uses `default: "REFUSE"` (the framework's recommended safety
 * polarity) and reaches EXECUTE through an explicit guard rather than an
 * EXECUTE default — the latter would require `allowDefaultExecute` opt-in,
 * which the `simulate` conformance gate does not pass.
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
  type IntentEnvelope,
  type PackV0,
  type TaintPolicy,
} from "@adjudicate/core";
import type { CapabilityPlanner, Plan } from "@adjudicate/core/llm";
import type { Guard, PolicyBundle } from "@adjudicate/core/kernel";

// ── Domain ──────────────────────────────────────────────────────────────────

export type VacationIntentKind =
  | "vacation.request"
  | "vacation.approve"
  | "vacation.cancel";

interface VacationRequest {
  readonly id: string;
  readonly employeeId: string;
  /** ISO date for the first day of leave. */
  readonly startDate: string;
  readonly durationDays: number;
  readonly status: "pending" | "approved" | "denied" | "cancelled";
  readonly approvedBy: string | null;
}

export interface VacationState {
  readonly employee: {
    readonly id: string;
    readonly role: "employee" | "manager";
    readonly ptoBalanceDays: number;
  };
  /** When non-null the intent operates on this existing request. */
  readonly request: VacationRequest | null;
  /** Identity of the actor proposing an `approve` intent. */
  readonly approverId: string | null;
  /** Wall-clock "now" used by the cancel-window guard. ISO-8601. */
  readonly nowISO: string;
}

const VACATION_POLICY = {
  /** Single contiguous request can't exceed this many days; excess is REWRITTEN. */
  maxConsecutiveDays: 14,
  /** Cancellations within this window of `startDate` need REQUEST_CONFIRMATION. */
  cancelWindowHours: 24,
} as const;

const vacationTaintPolicy: TaintPolicy = {
  minimumFor(kind) {
    return kind === "vacation.approve" ? "TRUSTED" : "UNTRUSTED";
  },
};

// ── Guards ──────────────────────────────────────────────────────────────────

type VacationGuard = Guard<VacationIntentKind, unknown, VacationState>;

const requestRequired: VacationGuard = (envelope, state) => {
  if (envelope.kind === "vacation.request") return null;
  if (state.request) return null;
  return decisionRefuse(
    refuse(
      "STATE",
      "vacation.request_not_found",
      "No matching vacation request was found.",
    ),
    [
      basis("state", BASIS_CODES.state.TRANSITION_ILLEGAL, {
        reason: "no_request",
      }),
    ],
  );
};

const clampDuration: VacationGuard = (envelope) => {
  if (envelope.kind !== "vacation.request") return null;
  const payload = envelope.payload as {
    readonly startDate: string;
    readonly durationDays: number;
  };
  if (payload.durationDays <= VACATION_POLICY.maxConsecutiveDays) return null;
  const rewritten = buildEnvelope({
    kind: envelope.kind,
    payload: { ...payload, durationDays: VACATION_POLICY.maxConsecutiveDays },
    actor: envelope.actor,
    taint: envelope.taint,
    nonce: envelope.nonce,
    createdAt: envelope.createdAt,
  });
  return decisionRewrite(
    rewritten,
    `Duration clamped to policy maximum of ${VACATION_POLICY.maxConsecutiveDays} days.`,
    [
      basis("business", BASIS_CODES.business.QUANTITY_CAPPED, {
        requested: payload.durationDays,
        cappedTo: VACATION_POLICY.maxConsecutiveDays,
      }),
    ],
  );
};

const cancelWindowConfirmation: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.cancel") return null;
  if (!state.request) return null;
  const now = new Date(state.nowISO).getTime();
  const start = new Date(state.request.startDate).getTime();
  const hoursUntilStart = (start - now) / (60 * 60 * 1000);
  if (hoursUntilStart >= VACATION_POLICY.cancelWindowHours) return null;
  return decisionRequestConfirmation(
    `Your leave starts in ${Math.round(hoursUntilStart)}h. Confirm cancellation?`,
    [
      basis("state", BASIS_CODES.state.TRANSITION_VALID, {
        hoursUntilStart: Math.round(hoursUntilStart),
      }),
    ],
  );
};

const noSelfApproval: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.approve") return null;
  if (!state.request || !state.approverId) return null;
  if (state.approverId !== state.request.employeeId) return null;
  return decisionEscalate(
    "supervisor",
    "Self-approval not permitted; routing to a supervisor for review.",
    [
      basis("auth", BASIS_CODES.auth.SCOPE_INSUFFICIENT, {
        actor: state.approverId,
        targetEmployee: state.request.employeeId,
      }),
    ],
  );
};

const sufficientBalance: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.request") return null;
  const payload = envelope.payload as { readonly durationDays: number };
  if (payload.durationDays <= state.employee.ptoBalanceDays) return null;
  return decisionRefuse(
    refuse(
      "BUSINESS_RULE",
      "pto.insufficient_balance",
      "You don't have enough PTO balance for that request.",
      `requested=${payload.durationDays}, balance=${state.employee.ptoBalanceDays}`,
    ),
    [
      basis("business", BASIS_CODES.business.RULE_VIOLATED, {
        requested: payload.durationDays,
        balance: state.employee.ptoBalanceDays,
      }),
    ],
  );
};

const deferIfNeedsApproval: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.request") return null;
  if (state.employee.role === "manager") return null;
  return decisionDefer("manager.approval", 24 * 60 * 60 * 1000, [
    basis("state", BASIS_CODES.state.TRANSITION_VALID, {
      reason: "manager_approval_pending",
      employeeId: state.employee.id,
    }),
  ]);
};

/**
 * Manager self-files within balance and policy max — the only path to
 * EXECUTE. Modelled as an explicit guard so the bundle can keep the
 * recommended `default: "REFUSE"` polarity (an EXECUTE default would
 * require `allowDefaultExecute`, which the `simulate` conformance gate
 * does not opt into).
 */
const executeManagerRequest: VacationGuard = (envelope, state) => {
  if (envelope.kind !== "vacation.request") return null;
  if (state.employee.role !== "manager") return null;
  return decisionExecute([
    basis("state", BASIS_CODES.state.TRANSITION_VALID, {
      reason: "manager_self_file",
      employeeId: state.employee.id,
    }),
  ]);
};

// ── Policy + planner ──────────────────────────────────────────────────────────

const vacationPolicyBundle: PolicyBundle<
  VacationIntentKind,
  unknown,
  VacationState
> = {
  stateGuards: [requestRequired, clampDuration, cancelWindowConfirmation],
  authGuards: [noSelfApproval],
  taint: vacationTaintPolicy,
  business: [sufficientBalance, deferIfNeedsApproval, executeManagerRequest],
  default: "REFUSE",
};

const vacationCapabilityPlanner: CapabilityPlanner<VacationState> = {
  plan(state): Plan {
    const isManager = state.employee.role === "manager";
    return {
      visibleReadTools: isManager
        ? ["list_my_requests", "check_pto_balance", "list_team_requests"]
        : ["list_my_requests", "check_pto_balance"],
      allowedIntents: isManager
        ? ["vacation.request", "vacation.approve", "vacation.cancel"]
        : ["vacation.request", "vacation.cancel"],
    };
  },
};

// ── Pack ──────────────────────────────────────────────────────────────────────

/**
 * The bundled demo Pack. `basisCodes` is REQUIRED by PackV0 and declares
 * the refusal/basis taxonomy the policy may emit (Phase 6 AaC verifies
 * no runtime drift). `rehydrateState` is omitted: this Pack's state is
 * already plain JSON (records + primitives), so it survives the scenario
 * file round-trip unchanged.
 */
export const vacationPack = {
  id: "demo-vacation-approval",
  version: "0.1.0",
  contract: "v0",
  intents: ["vacation.request", "vacation.approve", "vacation.cancel"],
  policy: vacationPolicyBundle,
  planner: vacationCapabilityPlanner,
  basisCodes: [
    BASIS_CODES.state.TRANSITION_VALID,
    BASIS_CODES.state.TRANSITION_ILLEGAL,
    BASIS_CODES.auth.SCOPE_INSUFFICIENT,
    BASIS_CODES.business.RULE_VIOLATED,
    BASIS_CODES.business.QUANTITY_CAPPED,
  ],
  signals: ["manager.approval"],
} as const satisfies PackV0<
  VacationIntentKind,
  unknown,
  VacationState
>;

export default vacationPack;

/** Domain-narrow envelope alias kept for any local typing needs. */
export type VacationEnvelope = IntentEnvelope<VacationIntentKind, unknown>;
