/**
 * Server-side kernel invoker for the playground.
 *
 * **This module imports `@adjudicate/core` and must run server-side only.**
 * Client components hit `/api/playground/*` instead. Even though Phase 0A
 * cleared the node:crypto bundling issue, the server-side seam stays —
 * the playground talks to the kernel through HTTP so the wire shape is
 * stable and the client bundle stays slim.
 */

import {
  adjudicateAndAudit,
  adjudicateWithTrace,
  buildEnvelope,
  installPack,
  type AdjudicationTraceEntry,
  type AuditRecord,
  type AuditSink,
  type Decision,
  type IntentEnvelope,
  type PackV0,
} from "@adjudicate/core";
import {
  deploymentsApprovalPack,
  rehydrateDeploymentState,
} from "@adjudicate/pack-deployments-approval";
import {
  IdentityKycPack,
  rehydrateKycState,
} from "@adjudicate/pack-identity-kyc";
import {
  paymentsPixPack,
  rehydratePixState,
} from "@adjudicate/pack-payments-pix";

interface InstalledPack {
  readonly id: string;
  readonly displayName: string;
  readonly intents: ReadonlyArray<string>;
  readonly pack: ReturnType<typeof installPack>["pack"];
  readonly emptyState: unknown;
  /**
   * Rehydrate a JSON-deserialised state object into the runtime shape the
   * Pack's policy guards expect (Maps where the schema uses them, etc.).
   * Plain JSON over the wire turns `Map` into `{}` — without this, guards
   * that call `state.charges.get(...)` blow up with
   * `state.charges.get is not a function`.
   */
  readonly rehydrateState: (raw: unknown) => unknown;
}

function installAll(): ReadonlyArray<InstalledPack> {
  const pix = installPack(paymentsPixPack as PackV0<string, unknown, unknown, unknown>);
  const kyc = installPack(IdentityKycPack as PackV0<string, unknown, unknown, unknown>);
  const dep = installPack(
    deploymentsApprovalPack as PackV0<string, unknown, unknown, unknown>,
  );
  return [
    {
      id: paymentsPixPack.id,
      displayName: "Payments · PIX",
      intents: [...paymentsPixPack.intents],
      pack: pix.pack,
      emptyState: { charges: new Map() },
      rehydrateState: rehydratePixState,
    },
    {
      id: IdentityKycPack.id,
      displayName: "Identity · KYC",
      intents: [...IdentityKycPack.intents],
      pack: kyc.pack,
      emptyState: { sessions: new Map() },
      rehydrateState: rehydrateKycState,
    },
    {
      id: deploymentsApprovalPack.id,
      displayName: "Deployments · Approval",
      intents: [...deploymentsApprovalPack.intents],
      pack: dep.pack,
      emptyState: { approvals: new Map() },
      rehydrateState: rehydrateDeploymentState,
    },
  ];
}

const INSTALLED = installAll();

export function matchPack(intentKind: string): InstalledPack | null {
  return (
    INSTALLED.find((p) => p.intents.includes(intentKind)) ?? null
  );
}

export interface PlaygroundRequest {
  readonly intentKind: string;
  readonly payload: Record<string, unknown>;
  /** Optional pre-loaded state for the Pack. Falls back to the empty state. */
  readonly state?: unknown;
}

export interface PlaygroundResponse {
  readonly decision: Decision;
  readonly record: AuditRecord;
  readonly packId: string;
  readonly packName: string;
  readonly trace: ReadonlyArray<AdjudicationTraceEntry>;
}

let memorySink: { records: AuditRecord[]; sink: AuditSink } | null = null;
function getInMemorySink(): { records: AuditRecord[]; sink: AuditSink } {
  if (memorySink) return memorySink;
  const records: AuditRecord[] = [];
  memorySink = {
    records,
    sink: {
      async emit(r) {
        records.push(r);
      },
    },
  };
  return memorySink;
}

export async function runPlayground(
  req: PlaygroundRequest,
): Promise<PlaygroundResponse> {
  const pack = matchPack(req.intentKind);
  if (!pack) {
    throw new Error(
      `No installed Pack handles intent kind "${req.intentKind}".`,
    );
  }
  const envelope: IntentEnvelope = buildEnvelope({
    kind: req.intentKind,
    payload: req.payload,
    actor: { principal: "user", sessionId: `playground-${Date.now()}` },
    taint: "UNTRUSTED",
    nonce: `playground-${req.intentKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  const { sink } = getInMemorySink();
  // Rehydrate JSON-shaped state (plain objects) into the runtime shape the
  // Pack expects (Maps for `charges` / `sessions` / `approvals`). When the
  // caller omits `state`, we still rehydrate the empty default to keep the
  // path uniform.
  const rawState = req.state ?? pack.emptyState;
  const state = pack.rehydrateState(rawState);
  const result = await adjudicateAndAudit(
    envelope,
    state,
    pack.pack.policy as never,
    { sink },
  );
  // Trace is computed inside adjudicateAndAudit but not exposed in its
  // return. Kernel is pure + deterministic; re-running yields the same
  // Decision and a fresh trace at sub-millisecond cost. Reuse the same
  // envelope + already-rehydrated state references — re-rehydrating would
  // waste work and risk drift if rehydrate*State ever becomes stateful.
  //
  // Defensive: if a Ledger is ever wired into playground deps, the audited
  // call could short-circuit with REFUSE/ledger_replay_suppressed while
  // this second call runs the full kernel — the trace would describe a
  // path that didn't really happen. Today playground has no ledger, so
  // unreachable. Suppress trace if the audited decision short-circuited.
  const isReplaySuppressed =
    result.decision.kind === "REFUSE" &&
    result.decision.refusal.code === "ledger_replay_suppressed";
  const traceResult = isReplaySuppressed
    ? { trace: [] as ReadonlyArray<AdjudicationTraceEntry> }
    : adjudicateWithTrace(envelope, state, pack.pack.policy as never);
  return {
    decision: result.decision,
    record: result.record,
    packId: pack.id,
    packName: pack.displayName,
    trace: traceResult.trace,
  };
}

/** All audit records produced by the playground, newest first. */
export function recentRecords(limit = 20): readonly AuditRecord[] {
  const { records } = getInMemorySink();
  return [...records].reverse().slice(0, limit);
}
