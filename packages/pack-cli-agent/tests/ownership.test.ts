/**
 * pack-cli-agent — 201 constitutional authority guard wired into authGuards (§D #8).
 *
 * Proves the wired guard is LOAD-BEARING for the mutating UNTRUSTED-min kind
 * `terminal.run`: when the host injects the authority context (the documented
 * seam) it gates the command and closes IDOR; when absent it is inert (pre-201
 * posture, preserving every six-outcomes test).
 *
 * NON-VACUITY (§7 risk 1): each test uses a state-valid, allowlisted-safe command
 * (`{command:"ls"}` + allowlist `["ls"]`) so the envelope PASSES the state guard
 * AND would otherwise EXECUTE — meaning it genuinely REACHES the auth phase. The
 * forged-owner refusal CODE is asserted to be the AUTH-phase signature
 * (`tenant_binding_violation` / `auth:scope_insufficient`), not a state code.
 */

import { describe, expect, it } from "vitest";
import { adjudicate } from "@adjudicate/core/kernel";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  type IntentEnvelope,
} from "@adjudicate/core";
import { cliAgentPack } from "../src/index.js";
import type {
  CliAuthorityContext,
  CliIntentKind,
  CliState,
} from "../src/types.js";

const policy = cliAgentPack.policy;
const DET_TIME = "2026-06-19T12:00:00.000Z";

const VICTIM = "host_owner_42"; // the REAL bound owner of the host scope
const RESOURCE = "/work"; // the cwd / host scope the snapshot binds

// The injected authority-graph snapshot: VICTIM owns the host scope.
const store = createAuthorityGraphStore({
  edges: [
    {
      principal: VICTIM,
      relationship: "owns" as const,
      resource: RESOURCE,
      permits: { actions: ["terminal.run"] },
    },
  ],
});

// Host session→identity map (the IDOR-closing seam). NEVER reads resourceRefs.
const sessionToPrincipal: Record<string, string> = {
  "s-owner": VICTIM,
  "s-attacker": "attacker_principal",
};
const authority: CliAuthorityContext = {
  store,
  principalOf: (sessionId) => sessionToPrincipal[sessionId] ?? null,
};

/** A state-valid, allowlisted-safe `ls` command + declared owner. */
function runEnv(
  sessionId: string,
  owner: string,
): IntentEnvelope<CliIntentKind, unknown> {
  return buildEnvelope({
    kind: "terminal.run",
    payload: { command: "ls" },
    actor: { principal: "llm", sessionId },
    taint: "UNTRUSTED",
    nonce: "n-cli",
    createdAt: DET_TIME,
    resourceRefs: { owner, resource: RESOURCE },
  });
}

/** Base state: `ls` allowlisted so a legit command EXECUTEs (reaches business). */
const baseState = (authCtx?: CliAuthorityContext): CliState => ({
  allowlist: new Set(["ls"]),
  allowedCwds: new Set<string>(),
  maintenanceActive: false,
  ...(authCtx !== undefined ? { authority: authCtx } : {}),
});

describe("pack-cli-agent — 201 authority guard (terminal.run owner predicate)", () => {
  it("inert without injected authority — allowlisted-safe command still EXECUTEs (pre-201 posture)", () => {
    const decision = adjudicate(runEnv("s-owner", VICTIM), baseState(), policy);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("BINDING with injected authority — an honestly-authenticated owner EXECUTEs", () => {
    const decision = adjudicate(runEnv("s-owner", VICTIM), baseState(authority), policy);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("REFUSEs the forged-unbound owner (declared owner not bound to the resource)", () => {
    const decision = adjudicate(runEnv("s-attacker", "attacker"), baseState(authority), policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("CLOSES IDOR — REFUSEs an impersonation (forged BOUND owner ≠ authenticated actor)", () => {
    // owner=VICTIM (the REAL bound owner) but the authenticated session resolves
    // to attacker_principal ⇒ REFUSE. The case the bare wiring would let escape.
    const decision = adjudicate(runEnv("s-attacker", VICTIM), baseState(authority), policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("FAILS CLOSED when authority is injected without a principalOf identity source", () => {
    const decision = adjudicate(runEnv("s-owner", VICTIM), baseState({ store }), policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });
});
