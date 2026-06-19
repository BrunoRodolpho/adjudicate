import { describe, expect, it, vi } from "vitest";
import type { AdopterExecutor } from "@adjudicate/adapter-core";
import { buildEnvelope, verifyResourceBinding, type IntentEnvelope } from "@adjudicate/core";
import {
  AUTO_REMEDIATION_BLAST_CAP,
  type IncidentDependency,
  type IncidentIntentKind,
  type IncidentState,
  type IncidentStatus,
  type RemediationExecutePayload,
} from "@adjudicate/pack-incident-response";
import {
  createInMemoryRemediationProposalStore,
  createRemediationOrchestrator,
} from "../src/index.js";
import { createInMemoryApprovalRegistry } from "@adjudicate/approval-engine";

function stateWith(
  overrides: { status?: IncidentStatus; deps?: IncidentDependency[] } = {},
): IncidentState {
  return {
    incidents: new Map([
      [
        "inc-1",
        {
          id: "inc-1",
          severity: "sev2",
          status: overrides.status ?? "open",
          dependencies: overrides.deps ?? [],
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    ]),
  };
}

function setup(state: IncidentState = stateWith()) {
  const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => ({ ok: true })),
  };
  const orch = createRemediationOrchestrator({ executor, getState: () => state });
  return { executor, orch };
}

const blast = (env: { payload: unknown }) =>
  (env.payload as RemediationExecutePayload).blastRadius;

describe("RemediationOrchestrator — SAFE auto (clamp -> re-adjudicate -> EXECUTE)", () => {
  it("clamps an oversized UNTRUSTED blast radius in TWO passes, then executes the clamped envelope", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 50,
      disposition: "SAFE",
      nonce: "n-safe",
    });

    // Two passes: REWRITE (clamp) then EXECUTE on the clamped envelope.
    expect(out.decisions.map((d) => d.kind)).toEqual(["REWRITE", "EXECUTE"]);
    expect(out.executed).toBe(true);
    expect(out.executedEnvelope).not.toBeNull();
    // The KERNEL clamped to the auto cap — not the orchestrator.
    expect(blast(out.executedEnvelope!)).toBe(AUTO_REMEDIATION_BLAST_CAP);
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
  });

  it("an absurd off-path blast radius still cannot exceed the cap (kernel decides)", async () => {
    const { orch } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 999_999,
      disposition: "SAFE",
      nonce: "n-absurd",
    });
    expect(blast(out.executedEnvelope!)).toBe(AUTO_REMEDIATION_BLAST_CAP);
  });

  it("a SAFE remediation already under the cap executes in a single pass", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "restart",
      blastRadius: 3,
      disposition: "SAFE",
      nonce: "n-small",
    });
    expect(out.decisions.map((d) => d.kind)).toEqual(["EXECUTE"]);
    expect(blast(out.executedEnvelope!)).toBe(3);
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
  });
});

describe("RemediationOrchestrator — REVIEW (operator/TRUSTED)", () => {
  it("a mid-range TRUSTED blast radius adjudicates to REQUEST_CONFIRMATION (no execution)", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      nonce: "n-review",
    });
    expect(out.decisions.at(-1)!.kind).toBe("REQUEST_CONFIRMATION");
    expect(out.pending?.kind).toBe("review");
    expect(typeof out.pending?.prompt).toBe("string");
    expect(out.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("a high TRUSTED blast radius adjudicates to ESCALATE (no execution)", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "failover",
      blastRadius: 30,
      disposition: "REVIEW",
      nonce: "n-escalate",
    });
    expect(out.decisions.at(-1)!.kind).toBe("ESCALATE");
    expect(out.pending?.kind).toBe("escalation");
    expect(out.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });
});

describe("RemediationOrchestrator — MANUAL escalation", () => {
  it("mints an incident.escalate envelope that EXECUTEs the escalation", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "n/a",
      blastRadius: 0,
      disposition: "MANUAL",
      reason: "needs a human",
      nonce: "n-manual",
    });
    expect(out.decisions.at(-1)!.kind).toBe("EXECUTE");
    expect(out.executed).toBe(true);
    expect(out.executedEnvelope!.kind).toBe("incident.escalate");
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
  });
});

describe("RemediationOrchestrator — refusal", () => {
  it("REFUSEs an unknown incident and executes nothing", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "ghost",
      action: "rollback",
      blastRadius: 1,
      disposition: "SAFE",
      nonce: "n-ghost",
    });
    expect(out.decisions.map((d) => d.kind)).toEqual(["REFUSE"]);
    expect(out.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });
});

describe("RemediationOrchestrator — DEFER (dependency down)", () => {
  it("DEFERs a SAFE remediation when a dependency is down; nothing executes", async () => {
    const { orch, executor } = setup(stateWith({ deps: [{ service: "db", status: "down" }] }));
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 3,
      disposition: "SAFE",
      nonce: "n-defer",
    });
    expect(out.decisions.at(-1)!.kind).toBe("DEFER");
    expect(out.pending?.kind).toBe("defer");
    expect(out.pending?.signal).toBe("incident.dependency.restored");
    expect(out.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });
});

describe("RemediationOrchestrator — zero independent authority", () => {
  it("exposes only handle()/resolve() — no invokeIntent of its own", () => {
    const { orch } = setup();
    expect("invokeIntent" in orch).toBe(false);
    expect(Object.keys(orch).sort()).toEqual(["handle", "resolve"]);
  });

  it("the only side-effect path is the injected adopter executor", async () => {
    const { orch, executor } = setup();
    await orch.handle({
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 2,
      disposition: "SAFE",
      nonce: "n-side",
    });
    // The side effect happened exactly once, and only via the adopter executor.
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
    expect(executor.invokeRead).not.toHaveBeenCalled();
  });
});

// ── 023: resource-binding fence at the Adjutant executor seam ────────────────
describe("RemediationOrchestrator — 023 resource binding (anti-IDOR)", () => {
  it("the env handed to invokeIntent is the kernel-bound one (re-derives its own intentHash)", async () => {
    const { orch, executor } = setup();
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 3,
      disposition: "SAFE",
      nonce: "n-bound",
    });
    expect(out.executed).toBe(true);
    // The executor received exactly the kernel-decided envelope, and that
    // envelope is resource-bound (its intentHash re-derives from its content) —
    // the fence (assertResourceBound) passed precisely because nothing swapped
    // the payload between decision and execution.
    const passed = (executor.invokeIntent as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { intentHash: string };
    expect(verifyResourceBinding(passed as never).bound).toBe(true);
    expect(passed.intentHash).toBe(out.executedEnvelope!.intentHash);
  });

  it("a forged/swapped proposal envelope is refused before invokeIntent (resolve path)", async () => {
    // Drive the resolve() seam with a proposal whose stored envelope payload was
    // swapped after it was minted (stale intentHash). The kernel would re-derive
    // a mismatch, but even if a forged EXECUTE were spliced in, assertResourceBound
    // fail-closes before the side effect. We assert the executor never fires.
    const state = stateWith();
    const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => ({ ok: true })),
    };
    const bound = buildEnvelope<IncidentIntentKind, RemediationExecutePayload>({
      kind: "incident.remediation.execute",
      payload: { incidentId: "inc-1", action: "rollback", blastRadius: 3 },
      actor: { principal: "user", sessionId: "inc-1" },
      taint: "TRUSTED",
      nonce: "n-forge",
    });
    const swapped = {
      ...bound,
      payload: { incidentId: "inc-VICTIM", action: "rollback", blastRadius: 3 },
    } as IntentEnvelope<IncidentIntentKind>;
    // Sanity: the swap genuinely breaks the binding.
    expect(verifyResourceBinding(swapped as never).bound).toBe(false);

    const proposalStore = createInMemoryRemediationProposalStore();
    proposalStore.put({
      proposalId: "p-forge",
      incidentId: "inc-1",
      action: "rollback",
      blastRadius: 3,
      disposition: "REVIEW",
      status: "pending_review",
      approvalToken: "tok-forge",
      intentHash: bound.intentHash,
      envelope: swapped,
      createdAt: "2026-06-18T00:00:00.000Z",
      updatedAt: "2026-06-18T00:00:00.000Z",
    });
    const orch = createRemediationOrchestrator({
      executor,
      getState: () => state,
      proposalStore,
    });
    // Accepting re-adjudicates the swapped envelope. The kernel refuses on the
    // intent-hash mismatch; the binding fence is the executor-seam backstop.
    const res = await orch.resolve({
      token: "tok-forge",
      accepted: true,
      at: "2026-06-18T01:00:00.000Z",
    });
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(res.executed).toBe(false);
  });
});

describe("RemediationOrchestrator — 071 receipt binding (approver, channel)", () => {
  it("an accepted resolve binds (approver, channel) onto the EXECUTE supersession", async () => {
    const state = stateWith();
    const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => ({ ok: true })),
    };
    const records: import("@adjudicate/core").AuditRecord[] = [];
    const proposalStore = createInMemoryRemediationProposalStore();
    const orch = createRemediationOrchestrator({
      executor,
      getState: () => state,
      proposalStore,
      approvalRegistry: createInMemoryApprovalRegistry(),
      sink: { async emit(r) { records.push(r); } },
    });

    // A REVIEW that adjudicates to REQUEST_CONFIRMATION parks a pending proposal.
    const out = await orch.handle({
      incidentId: "inc-1",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      nonce: "n-071-bind",
      at: "2026-06-18T00:00:00.000Z",
    });
    expect(out.pending?.kind).toBe("review");
    const proposal = proposalStore.list().find(
      (p) => p.status === "pending_review",
    )!;
    expect(proposal.approvalToken).toBeDefined();

    // The operator approves; the kernel substitutes EXECUTE and the audit row
    // links back via a confirmation_resolved supersession carrying the bound
    // approver + the ops-plane channel.
    const res = await orch.resolve({
      token: proposal.approvalToken!,
      accepted: true,
      by: { id: "operator-jane", displayName: "Jane" },
      at: "2026-06-18T01:00:00.000Z",
    });
    expect(res.executed).toBe(true);
    const exec = records.find((r) => r.decision.kind === "EXECUTE");
    expect(exec).toBeDefined();
    expect(exec!.supersedes).toMatchObject({
      reason: "confirmation_resolved",
      binding: { approver: "operator-jane", channel: "adjutant" },
    });
  });

  it("an accepted resolve with no `by` still binds the channel (approver omitted)", async () => {
    const state = stateWith();
    const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => ({ ok: true })),
    };
    const records: import("@adjudicate/core").AuditRecord[] = [];
    const proposalStore = createInMemoryRemediationProposalStore();
    const orch = createRemediationOrchestrator({
      executor,
      getState: () => state,
      proposalStore,
      approvalRegistry: createInMemoryApprovalRegistry(),
      sink: { async emit(r) { records.push(r); } },
    });
    await orch.handle({
      incidentId: "inc-1",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      nonce: "n-071-nobyy",
      at: "2026-06-18T00:00:00.000Z",
    });
    const proposal = proposalStore.list().find(
      (p) => p.status === "pending_review",
    )!;
    const res = await orch.resolve({
      token: proposal.approvalToken!,
      accepted: true,
      at: "2026-06-18T01:00:00.000Z",
    });
    expect(res.executed).toBe(true);
    const exec = records.find((r) => r.decision.kind === "EXECUTE");
    expect(exec!.supersedes).toMatchObject({
      reason: "confirmation_resolved",
      binding: { channel: "adjutant" },
    });
    expect(exec!.supersedes!.binding).not.toHaveProperty("approver");
  });

  // ── 072 — proposer (requestedBy) stamped on the request, NOT on the receipt ──
  it("stamps the proposer (requestedBy) on the ApprovalRequest from the minting actor", async () => {
    const state = stateWith();
    const proposalStore = createInMemoryRemediationProposalStore();
    const approvalRegistry = createInMemoryApprovalRegistry();
    const orch = createRemediationOrchestrator({
      executor: { invokeRead: vi.fn(async () => ({})), invokeIntent: vi.fn(async () => ({ ok: true })) },
      getState: () => state,
      proposalStore,
      approvalRegistry,
      // A REVIEW disposition is operator-originated → principal "user".
      actor: { principal: "user", sessionId: "operator-paula" },
    });

    await orch.handle({
      incidentId: "inc-1",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      nonce: "n-072-proposer",
      at: "2026-06-18T00:00:00.000Z",
    });
    const proposal = proposalStore.list().find((p) => p.status === "pending_review")!;
    const request = await approvalRegistry.get(proposal.approvalToken!);
    // The proposer is captured from the proposing envelope's actor — a stable
    // sessionId id with the provenance principal as the display label.
    expect(request?.requestedBy).toEqual({
      id: "operator-paula",
      displayName: "user",
    });
  });

  it("072: the proposer (requestedBy) is NEVER threaded into the kernel confirmationReceipt binding", async () => {
    const state = stateWith();
    const records: import("@adjudicate/core").AuditRecord[] = [];
    const proposalStore = createInMemoryRemediationProposalStore();
    const approvalRegistry = createInMemoryApprovalRegistry();
    const orch = createRemediationOrchestrator({
      executor: { invokeRead: vi.fn(async () => ({})), invokeIntent: vi.fn(async () => ({ ok: true })) },
      getState: () => state,
      proposalStore,
      approvalRegistry,
      actor: { principal: "user", sessionId: "operator-paula" },
      sink: { async emit(r) { records.push(r); } },
    });

    await orch.handle({
      incidentId: "inc-1",
      action: "patch",
      blastRadius: 12,
      disposition: "REVIEW",
      nonce: "n-072-no-receipt-proposer",
      at: "2026-06-18T00:00:00.000Z",
    });
    const proposal = proposalStore.list().find((p) => p.status === "pending_review")!;

    // A DIFFERENT identity (operator-jane) approves the maker's (operator-paula) request.
    const res = await orch.resolve({
      token: proposal.approvalToken!,
      accepted: true,
      by: { id: "operator-jane", displayName: "Jane" },
      at: "2026-06-18T01:00:00.000Z",
    });
    expect(res.executed).toBe(true);
    const exec = records.find((r) => r.decision.kind === "EXECUTE")!;
    // The kernel-side forensic binding records the APPROVER + channel only — the
    // proposer (operator-paula) is NOT present anywhere on the receipt binding.
    expect(exec.supersedes!.binding).toEqual({
      approver: "operator-jane",
      channel: "adjutant",
    });
    expect(exec.supersedes!.binding).not.toHaveProperty("proposer");
    expect(exec.supersedes!.binding).not.toHaveProperty("requestedBy");
    expect(JSON.stringify(exec.supersedes)).not.toContain("operator-paula");
  });
});
