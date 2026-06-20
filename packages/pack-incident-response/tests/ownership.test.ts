/**
 * pack-incident-response — 201 constitutional authority guard wired into authGuards (§D #8).
 *
 * Proves the wired guard is LOAD-BEARING for the mutating UNTRUSTED-min kinds
 * `incident.remediation.execute` / `incident.escalate`: when the host injects the
 * authority context (the documented seam) it gates the action and closes IDOR;
 * when absent it is inert (pre-201 posture, preserving every six-outcomes test).
 *
 * NON-VACUITY (§7 risk 1): each test injects a state incident the payload targets
 * (so the `validateRemediationTarget` state guard PASSES) and a valid blast
 * radius — so a legit owner's small remediation EXECUTEs and the forged-owner
 * envelope genuinely REACHES the auth phase. The refusal CODE is asserted to be
 * the AUTH-phase signature (`tenant_binding_violation` / `auth:scope_insufficient`),
 * NOT a state code (`incident.not_found` etc.).
 */

import { describe, expect, it } from "vitest";
import { adjudicate } from "@adjudicate/core/kernel";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  incidentResponsePack,
  rehydrateIncidentState,
  type Incident,
} from "../src/index.js";
import type {
  IncidentAuthorityContext,
  IncidentIntentKind,
  IncidentState,
} from "../src/types.js";

const policy = incidentResponsePack.policy;
const DET_TIME = "2026-06-19T12:00:00.000Z";

const VICTIM = "operator_victim_42"; // the REAL bound owner of the incident
const RESOURCE = "inc-1"; // the incident id / blast-radius target the snapshot binds

// The injected authority-graph snapshot: VICTIM owns the incident.
const store = createAuthorityGraphStore({
  edges: [
    {
      principal: VICTIM,
      relationship: "owns" as const,
      resource: RESOURCE,
      permits: { actions: ["incident.remediation.execute", "incident.escalate"] },
    },
  ],
});

// Host session→identity map (the IDOR-closing seam). NEVER reads resourceRefs.
const sessionToPrincipal: Record<string, string> = {
  "s-owner": VICTIM,
  "s-attacker": "attacker_principal",
};
const authority: IncidentAuthorityContext = {
  store,
  principalOf: (sessionId) => sessionToPrincipal[sessionId] ?? null,
};

const openIncident: Incident = {
  id: "inc-1",
  severity: "sev2",
  status: "open",
  dependencies: [],
  createdAt: DET_TIME,
};

/** Base state: a state incident `inc-1` the payload targets (state guard passes). */
function baseState(authCtx?: IncidentAuthorityContext): IncidentState {
  const hydrated = rehydrateIncidentState({ incidents: { "inc-1": openIncident } });
  return authCtx !== undefined ? { ...hydrated, authority: authCtx } : hydrated;
}

/** A small in-bounds UNTRUSTED remediation (would EXECUTE) + declared owner. */
function remediationEnv(
  sessionId: string,
  owner: string,
): IntentEnvelope<IncidentIntentKind, unknown> {
  return buildEnvelope({
    kind: "incident.remediation.execute",
    payload: { incidentId: "inc-1", action: "restart", blastRadius: 3 },
    actor: { principal: "llm", sessionId },
    taint: "UNTRUSTED",
    nonce: "n-remediation",
    createdAt: DET_TIME,
    resourceRefs: { owner, resource: RESOURCE },
  });
}

/** A manual escalation (would EXECUTE) + declared owner. */
function escalateEnv(
  sessionId: string,
  owner: string,
): IntentEnvelope<IncidentIntentKind, unknown> {
  return buildEnvelope({
    kind: "incident.escalate",
    payload: { incidentId: "inc-1", reason: "needs human" },
    actor: { principal: "llm", sessionId },
    taint: "UNTRUSTED",
    nonce: "n-escalate",
    createdAt: DET_TIME,
    resourceRefs: { owner, resource: RESOURCE },
  });
}

describe("pack-incident-response — 201 authority guard (remediation.execute / escalate)", () => {
  it("inert without injected authority — small remediation still EXECUTEs (pre-201 posture)", () => {
    const decision = adjudicate(remediationEnv("s-owner", VICTIM), baseState(), policy);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("BINDING with injected authority — an honestly-authenticated owner EXECUTEs the remediation", () => {
    const decision = adjudicate(
      remediationEnv("s-owner", VICTIM),
      baseState(authority),
      policy,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("BINDING with injected authority — an honestly-authenticated owner EXECUTEs the escalation", () => {
    const decision = adjudicate(escalateEnv("s-owner", VICTIM), baseState(authority), policy);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("remediation.execute REFUSEs the forged-unbound owner (not bound to the incident)", () => {
    const decision = adjudicate(
      remediationEnv("s-attacker", "attacker"),
      baseState(authority),
      policy,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("incident.escalate REFUSEs the forged-unbound owner", () => {
    const decision = adjudicate(
      escalateEnv("s-attacker", "attacker"),
      baseState(authority),
      policy,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("CLOSES IDOR — REFUSEs an impersonation (forged BOUND owner ≠ authenticated actor)", () => {
    const decision = adjudicate(
      remediationEnv("s-attacker", VICTIM),
      baseState(authority),
      policy,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("FAILS CLOSED when authority is injected without a principalOf identity source", () => {
    const decision = adjudicate(
      remediationEnv("s-owner", VICTIM),
      baseState({ store }),
      policy,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("the guard runs AFTER taint (§D #3): a system-only monitor.callback at UNTRUSTED hits the taint gate, not the owner predicate", () => {
    const authState = baseState(authority);
    const callbackEnv = buildEnvelope({
      kind: "incident.monitor.callback",
      payload: { incidentId: "inc-1", probeId: "p", observedStatus: "open", observedAt: DET_TIME },
      actor: { principal: "llm", sessionId: "s-attacker" },
      taint: "UNTRUSTED",
      nonce: "n-callback",
      createdAt: DET_TIME,
      resourceRefs: { owner: VICTIM, resource: RESOURCE },
    });
    const decision = adjudicate(callbackEnv, authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).not.toBe("tenant_binding_violation");
  });
});
