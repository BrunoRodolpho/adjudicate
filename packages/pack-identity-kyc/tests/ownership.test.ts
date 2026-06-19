/**
 * pack-identity-kyc — 201 constitutional authority guard wired into authGuards (§D #8).
 *
 * The SUBSTANTIVE close of the one genuinely-open 035-F1 ownership hole: before
 * 201 a forged/unbound/impersonated owner of `kyc.start` / `kyc.document.upload`
 * passed the EMPTY auth slot and landed on the unconditional business DEFER
 * guards ⇒ DEFER. Because the kernel evaluates state → taint → AUTH → business,
 * wiring `createAuthorityGuard` makes a forged owner REFUSE at the AUTH phase,
 * short-circuiting BEFORE the business DEFER ⇒ the outcome flips DEFER → REFUSE.
 *
 * NON-VACUITY (§7 risk 1): kyc has NO state guards, so `kyc.start` /
 * `kyc.document.upload` envelopes ALWAYS reach the auth phase (they would
 * otherwise hit the business DEFER guards). Each test injects `authority` and a
 * domain-valid payload, and asserts the refusal CODE is the AUTH-phase signature
 * (`tenant_binding_violation` / basis `auth:scope_insufficient`) — NOT a state
 * code — so the probe genuinely exercises the owner predicate, and the inert path
 * genuinely DEFERs (not refused upstream).
 */

import { describe, expect, it } from "vitest";
import { adjudicate } from "@adjudicate/core/kernel";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  type IntentEnvelope,
} from "@adjudicate/core";
import { IdentityKycPack } from "../src/index.js";
import type {
  IdentityKycIntentKind,
  IdentityKycState,
  KycAuthorityContext,
} from "../src/types.js";

const policy = IdentityKycPack.policy;
const DET_TIME = "2026-06-19T12:00:00.000Z";

const VICTIM = "user_victim_42"; // the REAL bound owner (the session's userId)
const RESOURCE = "kyc-user-42"; // the session's userId scope the snapshot binds

// The injected authority-graph snapshot: VICTIM owns the KYC subject resource.
const store = createAuthorityGraphStore({
  edges: [
    {
      principal: VICTIM,
      relationship: "owns" as const,
      resource: RESOURCE,
      permits: { actions: ["kyc.start", "kyc.document.upload"] },
    },
  ],
});

// Host session→identity map (the IDOR-closing seam). NEVER reads resourceRefs.
const sessionToPrincipal: Record<string, string> = {
  "s-owner": VICTIM, // an honestly-authenticated owner session
  "s-attacker": "attacker_principal", // NOT the owner
};
const authority: KycAuthorityContext = {
  store,
  principalOf: (sessionId) => sessionToPrincipal[sessionId] ?? null,
};

/** A `kyc.start` envelope with a state-valid domain payload + declared owner. */
function startEnv(
  sessionId: string,
  owner: string,
): IntentEnvelope<IdentityKycIntentKind, unknown> {
  return buildEnvelope({
    kind: "kyc.start",
    // Domain-valid: the payload kyc.start expects (sessionId/userId).
    payload: { sessionId: "s1", userId: RESOURCE },
    actor: { principal: "user", sessionId },
    taint: "UNTRUSTED",
    nonce: "n-kyc-start",
    createdAt: DET_TIME,
    resourceRefs: { owner, resource: RESOURCE },
  });
}

/** A `kyc.document.upload` envelope with a state-valid payload + declared owner. */
function uploadEnv(
  sessionId: string,
  owner: string,
): IntentEnvelope<IdentityKycIntentKind, unknown> {
  return buildEnvelope({
    kind: "kyc.document.upload",
    payload: {
      sessionId: "s1",
      documentType: "PASSPORT",
      documentRef: "doc-abc",
    },
    actor: { principal: "user", sessionId },
    taint: "UNTRUSTED",
    nonce: "n-kyc-upload",
    createdAt: DET_TIME,
    resourceRefs: { owner, resource: RESOURCE },
  });
}

describe("pack-identity-kyc — 201 authority guard (kyc.start / kyc.document.upload)", () => {
  it("inert without injected authority — kyc.start still DEFERs (pre-201 posture)", () => {
    // No `authority` in state ⇒ the guard returns null, the kyc.start intent
    // flows to the business DEFER guard exactly as before 201. Proves the seam is
    // opt-in AND that the inert path is NOT refused upstream (non-vacuity baseline).
    const noAuthState: IdentityKycState = { sessions: new Map() };
    const decision = adjudicate(startEnv("s-owner", VICTIM), noAuthState, policy);
    expect(decision.kind).toBe("DEFER");
  });

  it("inert without injected authority — kyc.document.upload still DEFERs (pre-201 posture)", () => {
    const noAuthState: IdentityKycState = { sessions: new Map() };
    const decision = adjudicate(uploadEnv("s-owner", VICTIM), noAuthState, policy);
    expect(decision.kind).toBe("DEFER");
  });

  it("BINDING with injected authority — an honestly-authenticated owner still DEFERs (no regression)", () => {
    // owner=VICTIM, session resolves to VICTIM ⇒ the authenticated actor IS the
    // owner ⇒ the guard continues (null) and the intent proceeds to the business
    // DEFER guard exactly as the legit pre-201 flow. The wiring does NOT add
    // friction for a legitimate owner.
    const authState: IdentityKycState = { sessions: new Map(), authority };
    const decision = adjudicate(startEnv("s-owner", VICTIM), authState, policy);
    expect(decision.kind).toBe("DEFER");
  });

  it("kyc.start forged-unbound owner → REFUSE (NOT DEFER) — the 035-F1 regression guard", () => {
    // The load-bearing assertion: a forged owner the snapshot does NOT bind must
    // REFUSE at the AUTH phase, short-circuiting BEFORE the business DEFER. This
    // is the DEFER → REFUSE flip the plan exists to deliver.
    const authState: IdentityKycState = { sessions: new Map(), authority };
    const decision = adjudicate(startEnv("s-attacker", "attacker"), authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("kyc.document.upload forged-unbound owner → REFUSE (NOT DEFER)", () => {
    const authState: IdentityKycState = { sessions: new Map(), authority };
    const decision = adjudicate(uploadEnv("s-attacker", "attacker"), authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("CLOSES IDOR — REFUSEs an impersonation (forged BOUND owner ≠ authenticated actor)", () => {
    // The attacker forges owner=VICTIM (the REAL bound owner) but the
    // authenticated session resolves to attacker_principal ⇒ REFUSE. This is the
    // case the bare wiring would let escape (DEFER); the principalOf seam closes
    // it AND short-circuits the business DEFER ⇒ REFUSE.
    const authState: IdentityKycState = { sessions: new Map(), authority };
    const decision = adjudicate(startEnv("s-attacker", VICTIM), authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("FAILS CLOSED when authority is injected without a principalOf identity source", () => {
    // A host that injects the store but NO identity map cannot prove the
    // authenticated actor, so even a genuinely-bound owner REFUSEs (no
    // false-sense-of-security fallback to bare declared-owner binding).
    const authState: IdentityKycState = {
      sessions: new Map(),
      authority: { store },
    };
    const decision = adjudicate(startEnv("s-owner", VICTIM), authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("the guard runs AFTER taint (§D #3): a system-only kyc.vendor.callback at UNTRUSTED hits the taint gate, not the owner predicate", () => {
    // kyc.vendor.callback is SYSTEM-min; an UNTRUSTED proposal must be refused by
    // the TAINT gate (taint short-circuits before auth), never reach the owner
    // predicate — and the guard never matches it anyway (excluded from GATED_KINDS).
    const authState: IdentityKycState = { sessions: new Map(), authority };
    const callbackEnv = buildEnvelope({
      kind: "kyc.vendor.callback",
      payload: { sessionId: "s1", score: 95, amlStatus: "CLEAR" },
      actor: { principal: "llm", sessionId: "s-attacker" },
      taint: "UNTRUSTED",
      nonce: "n-callback",
      createdAt: DET_TIME,
      resourceRefs: { owner: VICTIM, resource: RESOURCE },
    });
    const decision = adjudicate(callbackEnv, authState, policy);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    // The refusal is the TAINT gate's (SECURITY), reached BEFORE the auth phase —
    // so it is NOT the authority guard's tenant_binding_violation. This pins the
    // state→taint→auth ordering: taint short-circuits before the owner predicate.
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).not.toBe("tenant_binding_violation");
  });
});
