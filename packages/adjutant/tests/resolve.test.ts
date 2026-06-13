import { describe, expect, it, vi } from "vitest";
import type { AdopterExecutor } from "@adjudicate/adapter-core";
import { createInMemoryApprovalRegistry } from "@adjudicate/approval-engine";
import type { IncidentIntentKind, IncidentState } from "@adjudicate/pack-incident-response";
import {
  createInMemoryRemediationProposalStore,
  createRemediationOrchestrator,
} from "../src/index.js";

const STATE: IncidentState = {
  incidents: new Map([
    [
      "inc-1",
      { id: "inc-1", severity: "sev2", status: "open", dependencies: [], createdAt: "2026-06-01T00:00:00.000Z" },
    ],
  ]),
};

function setup(tokens: string[] = ["tok-1", "tok-2", "tok-3"]) {
  const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
    invokeRead: vi.fn(async () => ({})),
    invokeIntent: vi.fn(async () => ({ ok: true })),
  };
  const approvalRegistry = createInMemoryApprovalRegistry();
  const proposalStore = createInMemoryRemediationProposalStore();
  let i = 0;
  const orch = createRemediationOrchestrator({
    executor,
    getState: () => STATE,
    approvalRegistry,
    proposalStore,
    generateToken: () => tokens[i++ % tokens.length]!,
  });
  return { executor, approvalRegistry, proposalStore, orch };
}

// TRUSTED blast in [10,25) -> REQUEST_CONFIRMATION.
const reviewSignal = (nonce: string) => ({
  incidentId: "inc-1",
  action: "patch",
  blastRadius: 12,
  disposition: "REVIEW" as const,
  nonce,
  at: "2026-06-07T09:00:00.000Z",
});

describe("orchestrator REVIEW -> approval registration (item 13 / P2)", () => {
  it("registers a pending approval + a pending_review proposal carrying the envelope", async () => {
    const { orch, approvalRegistry, proposalStore } = setup();
    const out = await orch.handle(reviewSignal("n-1"));
    expect(out.pending?.kind).toBe("review");

    const pending = await approvalRegistry.list({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.token).toBe("tok-1");
    expect(pending[0]!.intentKind).toBe("incident.remediation.execute");

    const prop = proposalStore.getByToken("tok-1");
    expect(prop?.status).toBe("pending_review");
    expect(prop?.envelope).toBeDefined();
    expect(prop?.intentHash).toBe(pending[0]!.intentHash);
  });
});

describe("orchestrator.resolve — full re-adjudication via confirmationReceipt", () => {
  it("accept -> kernel substitutes EXECUTE -> adopter invokeIntent runs exactly once", async () => {
    const { orch, executor, proposalStore, approvalRegistry } = setup();
    await orch.handle(reviewSignal("n-1"));
    expect(executor.invokeIntent).not.toHaveBeenCalled(); // not executed at propose time

    const res = await orch.resolve({
      token: "tok-1",
      accepted: true,
      by: { id: "op-1", displayName: "Operator One" },
      at: "2026-06-07T10:00:00.000Z",
    });

    expect(res.resolved).toBe(true);
    expect(res.executed).toBe(true);
    expect(res.decision?.kind).toBe("EXECUTE");
    expect(executor.invokeIntent).toHaveBeenCalledTimes(1);
    expect(proposalStore.getByToken("tok-1")?.status).toBe("executed");
    const list = await approvalRegistry.list();
    expect(list.find((r) => r.token === "tok-1")?.status).toBe("approved");
  });

  it("the EXECUTE carries a confirmation:received basis (kernel substitution, not a minted EXECUTE)", async () => {
    const { orch } = setup();
    await orch.handle(reviewSignal("n-1"));
    const res = await orch.resolve({ token: "tok-1", accepted: true, at: "2026-06-07T10:00:00.000Z" });
    const codes = (res.decision?.basis ?? []).map((b) => `${b.category}:${b.code}`);
    expect(codes).toContain("confirmation:received");
  });

  it("decline -> nothing executes; proposal declined, approval declined", async () => {
    const { orch, executor, proposalStore, approvalRegistry } = setup();
    await orch.handle(reviewSignal("n-1"));
    const res = await orch.resolve({ token: "tok-1", accepted: false, at: "2026-06-07T10:00:00.000Z" });
    expect(res.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    expect(proposalStore.getByToken("tok-1")?.status).toBe("declined");
    const list = await approvalRegistry.list();
    expect(list.find((r) => r.token === "tok-1")?.status).toBe("declined");
  });

  it("unknown token -> resolved:false; nothing executes", async () => {
    const { orch, executor } = setup();
    const res = await orch.resolve({ token: "ghost", accepted: true, at: "2026-06-07T10:00:00.000Z" });
    expect(res.resolved).toBe(false);
    expect(res.executed).toBe(false);
    expect(executor.invokeIntent).not.toHaveBeenCalled();
  });

  it("accept but the incident went terminal after propose -> KERNEL refuses; nothing executes (safety)", async () => {
    // Mutable state so the incident can transition to terminal between handle()
    // and resolve(). The kernel re-adjudicates against CURRENT state at resolve
    // time — a confirmation receipt only overrides REQUEST_CONFIRMATION, never a
    // state-guard REFUSE — so an operator's approval cannot force a stale action.
    const executor: AdopterExecutor<IncidentIntentKind, unknown, IncidentState> = {
      invokeRead: vi.fn(async () => ({})),
      invokeIntent: vi.fn(async () => ({ ok: true })),
    };
    const approvalRegistry = createInMemoryApprovalRegistry();
    const proposalStore = createInMemoryRemediationProposalStore();
    let state: IncidentState = {
      incidents: new Map([
        ["inc-1", { id: "inc-1", severity: "sev2", status: "open", dependencies: [], createdAt: "2026-06-01T00:00:00.000Z" }],
      ]),
    };
    let i = 0;
    const orch = createRemediationOrchestrator({
      executor,
      getState: () => state,
      approvalRegistry,
      proposalStore,
      generateToken: () => `tok-${i++}`,
    });

    await orch.handle(reviewSignal("n-1")); // -> pending_review, token tok-0

    // The incident is resolved (terminal) before the operator approves.
    state = {
      incidents: new Map([
        ["inc-1", { id: "inc-1", severity: "sev2", status: "resolved", dependencies: [], createdAt: "2026-06-01T00:00:00.000Z" }],
      ]),
    };

    const res = await orch.resolve({ token: "tok-0", accepted: true, at: "2026-06-07T10:00:00.000Z" });
    expect(res.resolved).toBe(true);
    expect(res.accepted).toBe(true);
    expect(res.executed).toBe(false);
    expect(res.decision?.kind).toBe("REFUSE"); // validateRemediationTarget: terminal
    expect(executor.invokeIntent).not.toHaveBeenCalled();
    // The proposal reflects the kernel's refusal; the approval reflects that the
    // operator did approve (distinguishable from an operator decline).
    expect(proposalStore.getByToken("tok-0")?.status).toBe("refused");
    const list = await approvalRegistry.list();
    expect(list.find((r) => r.token === "tok-0")?.status).toBe("approved");
  });
});
