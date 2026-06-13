import { describe, expect, it, vi } from "vitest";
import type { AdopterExecutor } from "@adjudicate/adapter-core";
import {
  AUTO_REMEDIATION_BLAST_CAP,
  type IncidentDependency,
  type IncidentIntentKind,
  type IncidentState,
  type IncidentStatus,
  type RemediationExecutePayload,
} from "@adjudicate/pack-incident-response";
import { createRemediationOrchestrator } from "../src/index.js";

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
