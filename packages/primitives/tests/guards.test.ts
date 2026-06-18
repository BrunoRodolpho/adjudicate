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
  type OwnershipFact,
} from "@adjudicate/core";
import {
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
});
