import { describe, expect, it } from "vitest";
import {
  basis,
  buildEnvelope,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  refuse,
} from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import {
  createAuthorityGraphStore,
  resolveOwnership,
  type AuthorityGraphStore,
  type Guard,
  type OwnershipFact,
} from "@adjudicate/core";
import {
  createAuthorityGuard,
  createStateDeferGuard,
  createThresholdGuard,
  ownershipBindingPredicate,
  requireTenantBinding,
} from "../src/index.js";

const at = "2026-04-29T12:00:00.000Z";

interface RefundPayload {
  readonly amountCentavos: number;
}

const refundEnvelope = (amountCentavos: number) =>
  buildEnvelope({
    kind: "test.refund",
    payload: { amountCentavos } satisfies RefundPayload,
    actor: { principal: "llm", sessionId: "sess" },
    taint: "UNTRUSTED",
    nonce: `n-${amountCentavos}`,
    createdAt: at,
  });

describe("createThresholdGuard", () => {
  it("returns null when matches() is false", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: () => false,
      extract: (env) => env.payload.amountCentavos,
      threshold: 100,
      onCross: () => decisionExecute([]),
    });
    expect(guard(refundEnvelope(500), null)).toBeNull();
  });

  it("returns null when extract() yields null/undefined", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: () => true,
      extract: () => null,
      threshold: 100,
      onCross: () => decisionExecute([]),
    });
    expect(guard(refundEnvelope(500), null)).toBeNull();
  });

  it(">= comparator (default) — fires at and above threshold", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: (env) => env.kind === "test.refund",
      extract: (env) => env.payload.amountCentavos,
      threshold: 1_000,
      onCross: (value, threshold) =>
        decisionEscalate("supervisor", `value=${value} threshold=${threshold}`, [
          basis("business", "rule_satisfied", { value, threshold }),
        ]),
    });
    expect(guard(refundEnvelope(999), null)).toBeNull();
    const d = guard(refundEnvelope(1_000), null);
    expect(d?.kind).toBe("ESCALATE");
    expect(guard(refundEnvelope(1_001), null)?.kind).toBe("ESCALATE");
  });

  it("< comparator — fires strictly below threshold (KYC low-score case)", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: () => true,
      extract: (env) => env.payload.amountCentavos,
      threshold: 50,
      comparator: "<",
      onCross: () =>
        decisionRefuse(
          refuse("BUSINESS_RULE", "test.too_low", "denied", "below threshold"),
          [basis("business", "rule_violated", {})],
        ),
    });
    expect(guard(refundEnvelope(50), null)).toBeNull();
    expect(guard(refundEnvelope(49), null)?.kind).toBe("REFUSE");
  });

  it("passes value/threshold/envelope/state into onCross", () => {
    const seen: { v: number; t: number; kind: string; state: unknown }[] = [];
    const guard = createThresholdGuard<string, RefundPayload, { tag: string }>({
      matches: () => true,
      extract: (env) => env.payload.amountCentavos,
      threshold: 10,
      onCross: (v, t, env, state) => {
        seen.push({ v, t, kind: env.kind, state });
        return decisionExecute([]);
      },
    });
    guard(refundEnvelope(50), { tag: "ctx" });
    expect(seen).toEqual([
      { v: 50, t: 10, kind: "test.refund", state: { tag: "ctx" } },
    ]);
  });
});

describe("createStateDeferGuard", () => {
  it("returns null when matches() is false", () => {
    const guard = createStateDeferGuard<string, RefundPayload, unknown>({
      matches: () => false,
      signal: "test.signal",
      timeoutMs: 1_000,
      basis: [],
    });
    expect(guard(refundEnvelope(1), null)).toBeNull();
  });

  it("returns DEFER with provided signal/timeout/static-basis when matches", () => {
    const fixedBasis = [basis("state", "transition_valid", { reason: "x" })];
    const guard = createStateDeferGuard<string, RefundPayload, unknown>({
      matches: () => true,
      signal: "test.signal",
      timeoutMs: 5_000,
      basis: fixedBasis,
    });
    const d = guard(refundEnvelope(1), null);
    expect(d?.kind).toBe("DEFER");
    if (d?.kind === "DEFER") {
      expect(d.signal).toBe("test.signal");
      expect(d.timeoutMs).toBe(5_000);
      expect(d.basis).toEqual(fixedBasis);
    }
  });

  it("supports basis as a function for dynamic detail", () => {
    const guard = createStateDeferGuard<string, RefundPayload, { tag: string }>({
      matches: () => true,
      signal: "test.signal",
      timeoutMs: 1_000,
      basis: (env, state) => [
        basis("state", "transition_valid", {
          amount: env.payload.amountCentavos,
          tag: state.tag,
        }),
      ],
    });
    const d = guard(refundEnvelope(42), { tag: "alpha" });
    expect(d?.kind).toBe("DEFER");
    if (d?.kind === "DEFER") {
      expect(d.basis[0]?.detail).toEqual({ amount: 42, tag: "alpha" });
    }
  });

  it("state predicate: matches=true only when state condition holds", () => {
    const guard = createStateDeferGuard<
      string,
      RefundPayload,
      { confirmed: boolean }
    >({
      matches: (_env, state) => !state.confirmed,
      signal: "test.signal",
      timeoutMs: 1_000,
      basis: [],
    });
    expect(guard(refundEnvelope(1), { confirmed: true })).toBeNull();
    expect(guard(refundEnvelope(1), { confirmed: false })?.kind).toBe(
      "DEFER",
    );
  });
});

describe("L2 factories auto-attach GuardMetadata.description (ADR-105)", () => {
  it("createThresholdGuard attaches description.kind === 'threshold' with threshold + comparator", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: (env) => env.kind === "test.refund",
      extract: (env) => env.payload.amountCentavos,
      threshold: 5_000,
      comparator: ">",
      onCross: () => decisionExecute([]),
    });
    const meta = readGuardMetadata(guard);
    expect(meta?.description?.kind).toBe("threshold");
    if (meta?.description?.kind === "threshold") {
      expect(meta.description.threshold).toBe(5_000);
      expect(meta.description.comparator).toBe(">");
      // emits is intentionally undefined — factory does not introspect onCross.
      expect(meta.description.emits).toBeUndefined();
    }
  });

  it("createThresholdGuard defaults comparator to '>=' in the description", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: () => true,
      extract: (env) => env.payload.amountCentavos,
      threshold: 100,
      onCross: () => decisionExecute([]),
    });
    const meta = readGuardMetadata(guard);
    if (meta?.description?.kind === "threshold") {
      expect(meta.description.comparator).toBe(">=");
    } else {
      throw new Error("expected threshold metadata");
    }
  });

  it("createStateDeferGuard attaches description.kind === 'state_defer' with signal + timeoutMs", () => {
    const guard = createStateDeferGuard<string, RefundPayload, unknown>({
      matches: () => true,
      signal: "payment.confirmed",
      timeoutMs: 15 * 60 * 1000,
      basis: [],
    });
    const meta = readGuardMetadata(guard);
    expect(meta?.description?.kind).toBe("state_defer");
    if (meta?.description?.kind === "state_defer") {
      expect(meta.description.signal).toBe("payment.confirmed");
      expect(meta.description.timeoutMs).toBe(15 * 60 * 1000);
    }
  });

  it("metadata persists across guard invocation (not consumed by call)", () => {
    const guard = createThresholdGuard<string, RefundPayload, unknown>({
      matches: () => true,
      extract: (env) => env.payload.amountCentavos,
      threshold: 100,
      onCross: () => decisionExecute([]),
    });
    // Invoke the guard a few times; metadata should remain readable.
    for (let i = 0; i < 5; i++) {
      guard(refundEnvelope(200), null);
    }
    const meta = readGuardMetadata(guard);
    expect(meta?.description?.kind).toBe("threshold");
  });
});

describe("requireTenantBinding (AuthReviewer-009 / D-12)", () => {
  const env = buildEnvelope({
    kind: "test.mutation",
    payload: {},
    actor: { principal: "user", sessionId: "sess-a" },
    taint: "UNTRUSTED",
    nonce: "n-tenant",
    createdAt: at,
  });

  it("passes (null) when the actor is bound to the state's tenant", () => {
    const guard = requireTenantBinding<string, unknown, { tenantId: string }>(
      (actor, state) => state.tenantId === "t-a",
    );
    expect(guard(env, { tenantId: "t-a" })).toBeNull();
  });

  it("REFUSEs (tenant_binding_violation) on a cross-tenant mismatch", () => {
    const guard = requireTenantBinding<string, unknown, { tenantId: string }>(
      (actor, state) => state.tenantId === "t-a",
    );
    const decision = guard(env, { tenantId: "t-OTHER" });
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("trivially-true predicate is a no-op scaffold (single-tenant)", () => {
    const guard = requireTenantBinding<string, unknown, unknown>(() => true);
    expect(guard(env, {})).toBeNull();
  });
});

describe("ownershipBindingPredicate — 032 authority-graph fact seam", () => {
  // The 032 fact seam: an `OwnershipFact` adapts to the EXISTING
  // `requireTenantBinding` predicate shape `(actor, state) => boolean` WITHOUT
  // reshaping the fact — so 034 can wire an authority guard later. This plan
  // wires NO guard; these tests only pin the seam shape + scaffold-unwired.
  const graph = {
    edges: [
      {
        principal: "user_42",
        relationship: "owns" as const,
        resource: "acct_7",
        permits: { actions: ["pix.charge.refund"] },
      },
    ],
  };
  const store = createAuthorityGraphStore(graph);
  const owningEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: {},
    actor: { principal: "user", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-own",
    createdAt: at,
    resourceRefs: { owner: "user_42", resource: "acct_7" },
  });
  const foreignEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: {},
    actor: { principal: "user", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-foreign",
    createdAt: at,
    resourceRefs: { owner: "attacker", resource: "acct_7" },
  });

  it("maps a bound OwnershipFact to a `true` predicate (guard PASSES)", () => {
    // A 034 adopter closes over the store + envelope when building the guard.
    const predicate = ownershipBindingPredicate<unknown>(() =>
      resolveOwnership(store, owningEnv),
    );
    // The seam type IS exactly requireTenantBinding's predicate shape — proven by
    // feeding the predicate straight into requireTenantBinding (compiles + runs).
    const guard = requireTenantBinding<string, unknown, unknown>(predicate);
    expect(guard(owningEnv, {})).toBeNull(); // bound ⇒ guard has no opinion (passes)
  });

  it("maps an UNbound OwnershipFact to a `false` predicate (guard REFUSEs)", () => {
    const predicate = ownershipBindingPredicate<unknown>(() =>
      resolveOwnership(store, foreignEnv),
    );
    const guard = requireTenantBinding<string, unknown, unknown>(predicate);
    const decision = guard(foreignEnv, {});
    // The fact never authorizes — at most it lets the guard RAISE friction (REFUSE).
    expect(decision?.kind).toBe("REFUSE");
  });

  it("the predicate is the identity on `OwnershipFact.bound` (no authorization)", () => {
    const boundFact: OwnershipFact = resolveOwnership(store, owningEnv);
    const unboundFact: OwnershipFact = resolveOwnership(store, foreignEnv);
    expect(boundFact.bound).toBe(true);
    expect(unboundFact.bound).toBe(false);
    expect(ownershipBindingPredicate(() => boundFact)({ principal: "user", sessionId: "s" }, {})).toBe(true);
    expect(ownershipBindingPredicate(() => unboundFact)({ principal: "user", sessionId: "s" }, {})).toBe(false);
  });

  // ── 033 — the snapshot reaches a guard ONLY via injected state ─────────────
  // 033 injects + records the authority snapshot. The guard signature MUST stay
  // `(envelope, state)` — the kernel never passes identity/RuntimeContext to a
  // guard (index §D / policy.ts), so the snapshot can only flow through `state`.
  // No identity argument is added by 033; these tests pin that invariant.
  it("033 — the guard is arity-2 `(envelope, state)`; no identity argument is added", () => {
    const guard: Guard<string, unknown, AuthorityGraphStore> = requireTenantBinding<
      string,
      unknown,
      AuthorityGraphStore
    >((_actor, injectedStore) =>
      // The injected snapshot rides through `state` — here `state` IS the store.
      resolveOwnership(injectedStore, owningEnv).bound,
    );
    // The guard takes exactly TWO parameters: (envelope, state). A third
    // identity argument would be a kernel-contract break (it is not present).
    expect(guard.length).toBe(2);
    // Injected via state ⇒ bound ⇒ passes; a DIFFERENT injected snapshot flips it.
    expect(guard(owningEnv, store)).toBeNull();
    expect(
      guard(owningEnv, createAuthorityGraphStore({ edges: [] }))?.kind,
    ).toBe("REFUSE");
  });
});

describe("createAuthorityGuard — 034 constitutional authority guard", () => {
  // The injected authority-graph snapshot: user_42 owns acct_7. The guard reads
  // the OwnershipFact (via 032's resolveOwnership) from the injected STATE — the
  // store rides through `state`, the kernel never hands a guard an identity arg.
  const graph = {
    edges: [
      {
        principal: "user_42",
        relationship: "owns" as const,
        resource: "acct_7",
        permits: { actions: ["pix.charge.refund"] },
      },
    ],
  };
  const store = createAuthorityGraphStore(graph);

  // A mutating, UNTRUSTED-min money-mover (the exact §D #8 shape) declaring the
  // TRUE owner of the resource it operates on.
  const ownedEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 5000 },
    actor: { principal: "user", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-owned",
    createdAt: at,
    resourceRefs: { owner: "user_42", resource: "acct_7" },
  });
  // The IDOR attempt: a foreign principal claims a resource it does not own.
  const idorEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 5000 },
    actor: { principal: "user", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-idor",
    createdAt: at,
    resourceRefs: { owner: "attacker", resource: "acct_7" },
  });
  // The IMPERSONATION attempt (the case that DEFEATS the bare wiring): an
  // attacker session forges the REAL bound owner (`user_42`) of `acct_7`. The
  // snapshot DOES bind user_42→acct_7, so `fact.bound` is true — the only thing
  // that can stop this is binding the AUTHENTICATED actor, not the declared owner.
  const impersonationEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 5000 },
    actor: { principal: "user", sessionId: "attacker-session" },
    taint: "UNTRUSTED",
    nonce: "n-impersonation",
    createdAt: at,
    resourceRefs: { owner: "user_42", resource: "acct_7" },
  });
  // No authorization slot at all — the owner cannot be resolved.
  const noRefsEnv = buildEnvelope({
    kind: "pix.charge.refund",
    payload: { amountCentavos: 5000 },
    actor: { principal: "user", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-norefs",
    createdAt: at,
  });

  // The guard 035 would wire onto a pack's authGuards: it closes over the
  // injected store (read from `state`) and resolves ownership from the envelope.
  const guard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
    (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
  );

  it("returns null (continue) when the actor is bound to the resource owner", () => {
    expect(guard(ownedEnv, store)).toBeNull();
  });

  it("REFUSEs (SECURITY/tenant_binding_violation, basis auth.scope_insufficient) on owner mismatch", () => {
    const decision = guard(idorEnv, store);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    // The pinned basis code — reused from requireTenantBinding so the IDOR-class
    // refusal surfaces under one stable code.
    expect(
      decision.basis.map((b) => `${b.category}:${b.code}`),
    ).toContain("auth:scope_insufficient");
  });

  it("FAILS CLOSED (REFUSE, never null) when the owner ref is absent/unresolvable", () => {
    const decision = guard(noRefsEnv, store);
    expect(decision).not.toBeNull();
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("FAILS CLOSED (REFUSE, never null) when the injected snapshot has no binding edge", () => {
    // A misconfigured/empty graph store ⇒ no edge binds ⇒ REFUSE, never bypass.
    const decision = guard(ownedEnv, createAuthorityGraphStore({ edges: [] }));
    expect(decision?.kind).toBe("REFUSE");
  });

  it("FAILS CLOSED (REFUSE, never null) when the resolver THROWS (absent graph store)", () => {
    const throwingGuard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
      () => {
        throw new Error("authority graph store not injected");
      },
    );
    const decision = throwingGuard(ownedEnv, store);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("is arity-2 `(envelope, state)` — no kernel-contract identity argument", () => {
    expect(guard.length).toBe(2);
  });

  it("emits ONLY closed-algebra outcomes (REFUSE | null), never a 7th kind or metadata field", () => {
    const passed = guard(ownedEnv, store);
    const refused = guard(idorEnv, store);
    expect(passed).toBeNull();
    expect(refused?.kind).toBe("REFUSE");
    if (refused?.kind !== "REFUSE") return;
    // Closed 6-outcome Decision: REFUSE carries exactly { kind, refusal, basis }
    // — no `confidence`, no free `metadata` (§D #2).
    expect(Object.keys(refused).sort()).toEqual(["basis", "kind", "refusal"]);
  });

  it("honors the `matches` scope predicate (out-of-scope kinds pass with null)", () => {
    const scoped = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
      (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
      { matches: (env) => env.kind === "pix.charge.refund" },
    );
    // An out-of-scope kind is not this guard's concern ⇒ null (its own guards/
    // taint floor govern it). In-scope IDOR still REFUSEs.
    const otherKindEnv = buildEnvelope({
      kind: "demo.read.balance",
      payload: {},
      actor: { principal: "user", sessionId: "s" },
      taint: "UNTRUSTED",
      nonce: "n-other",
      createdAt: at,
      resourceRefs: { owner: "attacker", resource: "acct_7" },
    });
    expect(scoped(otherKindEnv, store)).toBeNull();
    expect(scoped(idorEnv, store)?.kind).toBe("REFUSE");
  });

  // ── KNOWN RESIDUAL: the BARE ownership-binding wiring does NOT close IDOR ─────
  // The reviewer-flagged bypass, pinned as the CURRENT (forgeable) behavior so a
  // downstream wiring (035) is NOT misled. Under the bare `resolveOwnership`-only
  // wiring, `OwnershipFact.principal` is read from the attacker-controlled
  // `resourceRefs.owner`. Forging the REAL bound owner of a resource PASSES the
  // bare check (the snapshot binds that owner to the resource) even though the
  // authenticated session is NOT that owner — a full IDOR bypass.
  it("RESIDUAL: bare wiring PASSES an impersonation (forged BOUND owner) — IDOR is NOT closed without the authenticatedPrincipal seam", () => {
    // The bare guard binds the DECLARED owner, never the authenticated actor.
    // user_42 owns acct_7 in the snapshot; the attacker forges owner=user_42.
    expect(guard(impersonationEnv, store)).toBeNull();
  });

  // ── IDOR CLOSED: supply the authenticatedPrincipal seam ──────────────────────
  // With an authenticated principal on the auth path (derived from the actor,
  // NEVER from resourceRefs.owner), the guard additionally requires the resolved
  // owner principal to EQUAL the authenticated principal — so the impersonation is
  // REFUSEd. This is the property the IDOR-closure claim actually requires.
  const sessionToPrincipal: Record<string, string> = {
    "attacker-session": "attacker-principal", // NOT user_42
    s: "user_42", // an honestly-authenticated owner session
  };
  const idorClosedGuard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
    (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
    {
      authenticatedPrincipal: (envelope) =>
        sessionToPrincipal[envelope.actor.sessionId] ?? null,
    },
  );

  it("CLOSES IDOR with the authenticatedPrincipal seam: the impersonation (forged BOUND owner) is REFUSEd", () => {
    const decision = idorClosedGuard(impersonationEnv, store);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("with the seam, an honestly-authenticated owner (session resolves to the declared owner) PASSES", () => {
    // `ownedEnv` declares owner=user_42 with sessionId="s", and the identity map
    // resolves "s"→"user_42" — the authenticated actor IS the owner ⇒ null.
    expect(idorClosedGuard(ownedEnv, store)).toBeNull();
  });

  it("with the seam, FAILS CLOSED when the session resolves to no authenticated principal (null)", () => {
    const unknownSessionEnv = buildEnvelope({
      kind: "pix.charge.refund",
      payload: { amountCentavos: 5000 },
      actor: { principal: "user", sessionId: "no-such-session" },
      taint: "UNTRUSTED",
      nonce: "n-unknown-session",
      createdAt: at,
      resourceRefs: { owner: "user_42", resource: "acct_7" },
    });
    const decision = idorClosedGuard(unknownSessionEnv, store);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("with the seam, FAILS CLOSED when the authenticatedPrincipal resolver THROWS", () => {
    const throwingIdentityGuard = createAuthorityGuard<string, unknown, AuthorityGraphStore>(
      (envelope, injectedStore) => resolveOwnership(injectedStore, envelope),
      {
        authenticatedPrincipal: () => {
          throw new Error("identity map not injected");
        },
      },
    );
    // The declared owner is bound (would pass the first gate) but the identity
    // resolver throws ⇒ REFUSE, never a fail-open null.
    const decision = throwingIdentityGuard(ownedEnv, store);
    expect(decision?.kind).toBe("REFUSE");
    if (decision?.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });
});
