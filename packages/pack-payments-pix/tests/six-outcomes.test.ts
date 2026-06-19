/**
 * pack-payments-pix — all six Decision outcomes + DEFER round-trip.
 *
 * One test per Decision outcome the kernel can return (EXECUTE, REFUSE,
 * ESCALATE, REQUEST_CONFIRMATION, DEFER, REWRITE) plus a round-trip showing
 * the create→DEFER then confirm→EXECUTE sequence the Pack supports, plus a
 * negative taint check confirming UNTRUSTED can't propose the webhook intent.
 */

import { describe, expect, it } from "vitest";
import { adjudicate, adjudicateAndAudit } from "@adjudicate/core/kernel";
import {
  buildEnvelope,
  createAuthorityGraphStore,
  deriveIntentHash,
  noopAuditSink,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  CONFIRM_REFUND_THRESHOLD_CENTAVOS,
  ESCALATE_REFUND_THRESHOLD_CENTAVOS,
  PIX_CONFIRMATION_SIGNAL,
  PIX_DEFAULT_DEFER_TIMEOUT_MS,
  pixPolicyBundle,
  type PixAuthorityContext,
  type PixCharge,
  type PixIntentKind,
  type PixState,
} from "../src/index.js";

const DET_TIME = "2026-04-26T12:00:00.000Z";

function envelope(
  kind: PixIntentKind,
  payload: Record<string, unknown>,
  taint: "SYSTEM" | "TRUSTED" | "UNTRUSTED" = "UNTRUSTED",
): IntentEnvelope<PixIntentKind, unknown> {
  return buildEnvelope({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "s-1" },
    taint,
    nonce: "n-test", createdAt: DET_TIME,
  });
}

function fixtures(): ReadonlyMap<string, PixCharge> {
  return new Map<string, PixCharge>([
    [
      "cha-pending",
      {
        id: "cha-pending",
        amountCentavos: 30_000,
        status: "pending",
        nonce: "n-test", createdAt: DET_TIME,
      },
    ],
    [
      "cha-confirmed-low",
      {
        id: "cha-confirmed-low",
        amountCentavos: 30_000,
        status: "confirmed",
        nonce: "n-test", createdAt: DET_TIME,
        confirmedAt: DET_TIME,
      },
    ],
    [
      "cha-confirmed-mid",
      {
        id: "cha-confirmed-mid",
        amountCentavos: 75_000,
        status: "confirmed",
        nonce: "n-test", createdAt: DET_TIME,
        confirmedAt: DET_TIME,
      },
    ],
    [
      "cha-confirmed-high",
      {
        id: "cha-confirmed-high",
        amountCentavos: 200_000,
        status: "confirmed",
        nonce: "n-test", createdAt: DET_TIME,
        confirmedAt: DET_TIME,
      },
    ],
    [
      "cha-refunded",
      {
        id: "cha-refunded",
        amountCentavos: 30_000,
        status: "refunded",
        nonce: "n-test", createdAt: DET_TIME,
        confirmedAt: DET_TIME,
        refundedAt: DET_TIME,
        refundedCentavos: 30_000,
      },
    ],
  ]);
}

const state = (): PixState => ({ charges: fixtures() });

describe("pack-payments-pix — six Decision outcomes", () => {
  it("EXECUTE: refund within thresholds on a confirmed charge", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-confirmed-low",
        refundCentavos: 20_000,
        reason: "customer request",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("EXECUTE: confirm a pending charge with TRUSTED taint", () => {
    const decision = adjudicate(
      envelope(
        "pix.charge.confirm",
        {
          chargeId: "cha-pending",
          providerTxId: "ptx-1",
          confirmedAt: DET_TIME,
        },
        "TRUSTED",
      ),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });

  it("REFUSE (not_found): refund on a non-existent charge", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-missing",
        refundCentavos: 1_000,
        reason: "test",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("pix.charge.not_found");
  });

  it("REFUSE (not_confirmed): refund on a pending charge", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-pending",
        refundCentavos: 1_000,
        reason: "test",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("pix.charge.not_confirmed");
  });

  it("REFUSE (already_refunded): refund on an already-refunded charge", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-refunded",
        refundCentavos: 1_000,
        reason: "test",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("pix.charge.already_refunded");
  });

  it("REFUSE (amount_invalid): charge.create with zero amount", () => {
    const decision = adjudicate(
      envelope("pix.charge.create", {
        amountCentavos: 0,
        payerDocument: "12345678900",
        description: "test",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("pix.charge.amount_invalid");
  });

  it("REWRITE: refund > original amount is clamped to original", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-confirmed-low", // original 30_000
        refundCentavos: 50_000,
        reason: "customer request",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REWRITE");
    if (decision.kind !== "REWRITE") return;
    const rewritten = decision.rewritten.payload as {
      refundCentavos: number;
    };
    expect(rewritten.refundCentavos).toBe(30_000);
  });

  // 011/T2+T3: the REWRITE outcome, run through the audited kernel path, records
  // the EXECUTED (rewritten) hash — not the original benign hash — and links it
  // back to the original via a `rewrite_executed` supersession.
  it("REWRITE through adjudicateAndAudit records the executed (rewritten) hash + rewrite_executed supersession", async () => {
    const original = envelope("pix.charge.refund", {
      chargeId: "cha-confirmed-low", // original 30_000
      refundCentavos: 50_000, // clamped to 30_000 on rewrite
      reason: "customer request",
    });

    // Sanity: the pure kernel REWRITEs this proposal.
    const pure = adjudicate(original, state(), pixPolicyBundle);
    expect(pure.kind).toBe("REWRITE");
    if (pure.kind !== "REWRITE") return;
    const rewrittenHash = pure.rewritten.intentHash;
    expect(rewrittenHash).not.toBe(original.intentHash);
    // The rewritten hash genuinely re-derives from the rewritten content.
    expect(deriveIntentHash(pure.rewritten)).toBe(rewrittenHash);

    const { decision, record } = await adjudicateAndAudit(
      original,
      state(),
      pixPolicyBundle,
      { sink: noopAuditSink() },
    );

    // The decision is still a REWRITE (the rewritten envelope re-adjudicated to
    // a second-pass EXECUTE, so the adapter will execute the rewritten bytes).
    expect(decision.kind).toBe("REWRITE");

    // The durable audit row indexes the EXECUTED (rewritten) hash, NOT the
    // original benign hash.
    expect(record.intentHash).toBe(rewrittenHash);
    expect(record.envelope.intentHash).toBe(rewrittenHash);
    expect(record.intentHash).not.toBe(original.intentHash);

    // …with a rewrite_executed supersession back to the original proposal.
    expect(record.supersedes).toBeDefined();
    expect(record.supersedes?.reason).toBe("rewrite_executed");
    expect(record.supersedes?.predecessorIntentHash).toBe(original.intentHash);
  });

  it("REQUEST_CONFIRMATION: refund at the medium threshold", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-confirmed-mid", // 75_000 original; 50_000 refund within original
        refundCentavos: CONFIRM_REFUND_THRESHOLD_CENTAVOS,
        reason: "customer request",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("ESCALATE: refund at or above the supervisor threshold", () => {
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-confirmed-high", // 200_000 original
        refundCentavos: ESCALATE_REFUND_THRESHOLD_CENTAVOS,
        reason: "customer request",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("ESCALATE");
    if (decision.kind !== "ESCALATE") return;
    expect(decision.to).toBe("supervisor");
  });

  it("DEFER: charge.create parks awaiting the provider webhook signal", () => {
    const decision = adjudicate(
      envelope("pix.charge.create", {
        amountCentavos: 5_000,
        payerDocument: "12345678900",
        description: "test charge",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("DEFER");
    if (decision.kind !== "DEFER") return;
    expect(decision.signal).toBe(PIX_CONFIRMATION_SIGNAL);
    expect(decision.timeoutMs).toBe(PIX_DEFAULT_DEFER_TIMEOUT_MS);
  });
});

describe("pack-payments-pix — DEFER round-trip + taint security", () => {
  it("create defers; later TRUSTED confirm executes", () => {
    // Step 1 — customer-initiated charge.create defers awaiting webhook.
    const createDecision = adjudicate(
      envelope("pix.charge.create", {
        amountCentavos: 5_000,
        payerDocument: "12345678900",
        description: "test",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(createDecision.kind).toBe("DEFER");

    // (Adopter would: park the envelope keyed by intent hash, await the
    //  PIX_CONFIRMATION_SIGNAL via @adjudicate/runtime's
    //  resumeDeferredIntent, then synthesize a TRUSTED pix.charge.confirm
    //  intent from the webhook payload.)

    // Step 2 — webhook arrives; TRUSTED confirm succeeds against pending charge.
    const confirmDecision = adjudicate(
      envelope(
        "pix.charge.confirm",
        {
          chargeId: "cha-pending",
          providerTxId: "ptx-1",
          confirmedAt: DET_TIME,
        },
        "TRUSTED",
      ),
      state(),
      pixPolicyBundle,
    );
    expect(confirmDecision.kind).toBe("EXECUTE");
  });

  it("confirm with UNTRUSTED taint is refused (taint guard)", () => {
    const decision = adjudicate(
      envelope(
        "pix.charge.confirm",
        {
          chargeId: "cha-pending",
          providerTxId: "ptx-1",
          confirmedAt: DET_TIME,
        },
        "UNTRUSTED",
      ),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
  });
});

// ── B1 — agent-session refund confirm rule ───────────────────────────────────

describe("pack-payments-pix — B1 agent-session refund always confirms", () => {
  /** An envelope whose actor.sessionId lives in the `agent:` namespace. */
  function agentRefund(
    chargeId: string,
    refundCentavos: number,
  ): IntentEnvelope<PixIntentKind, unknown> {
    return buildEnvelope({
      kind: "pix.charge.refund",
      payload: { chargeId, refundCentavos, reason: "agent remediation" },
      // The production planner stamps principal:"llm" for agent triggers; agent
      // identity rides the sessionId namespace, not the principal.
      actor: {
        principal: "llm",
        sessionId: "agent:pix-payment-failure-remediation@0.1.0:entity:order-1",
      },
      taint: "UNTRUSTED",
      nonce: "n-test",
      createdAt: DET_TIME,
    });
  }

  it("agent refund BELOW the confirm threshold → REQUEST_CONFIRMATION (not EXECUTE)", () => {
    // 20_000 is < CONFIRM_REFUND_THRESHOLD (50_000): a user session EXECUTEs
    // this exact refund (the EXECUTE test above), but an agent session confirms.
    const decision = adjudicate(
      agentRefund("cha-confirmed-low", 20_000),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("agent refund pre-empts the supervisor-escalate threshold → still REQUEST_CONFIRMATION", () => {
    // 120_000 ≥ ESCALATE_REFUND_THRESHOLD (100_000), so a user session would
    // ESCALATE; the agent rule runs first and confirms instead (parks an approval).
    const decision = adjudicate(
      agentRefund("cha-confirmed-high", 120_000),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("REQUEST_CONFIRMATION");
  });

  it("non-agent (user/system) refund under the threshold still EXECUTEs — no regression", () => {
    // Default `envelope()` stamps sessionId "s-1" (not agent-namespaced).
    const decision = adjudicate(
      envelope("pix.charge.refund", {
        chargeId: "cha-confirmed-low",
        refundCentavos: 20_000,
        reason: "customer request",
      }),
      state(),
      pixPolicyBundle,
    );
    expect(decision.kind).toBe("EXECUTE");
  });
});

// ── 035 — constitutional authority guard wired into PIX authGuards (§D #8) ────
// Proves the wired guard is LOAD-BEARING: when the host injects the authority
// context (the documented seam) it gates money-moving UNTRUSTED kinds and closes
// IDOR; when absent it is inert (pre-035 posture, preserving every test above).

describe("pack-payments-pix — 035 authority guard (money-moving owner predicate)", () => {
  const VICTIM = "merchant_42";
  const RESOURCE = "acct_7";

  // The injected authority-graph snapshot: merchant_42 owns acct_7.
  const store = createAuthorityGraphStore({
    edges: [
      {
        principal: VICTIM,
        relationship: "owns" as const,
        resource: RESOURCE,
        permits: { actions: ["pix.charge.refund", "pix.charge.create"] },
      },
    ],
  });

  // Host session→identity map (the IDOR-closing seam). NEVER reads resourceRefs.
  const sessionToPrincipal: Record<string, string> = {
    "s-owner": VICTIM, // an honestly-authenticated owner session
    "s-attacker": "attacker_principal", // NOT the owner
  };
  const authority: PixAuthorityContext = {
    store,
    principalOf: (sessionId) => sessionToPrincipal[sessionId] ?? null,
  };

  // A confirmed charge the refund can act on (so business would otherwise EXECUTE).
  const baseCharges = (): ReadonlyMap<string, PixCharge> =>
    new Map<string, PixCharge>([
      [
        "cha-1",
        {
          id: "cha-1",
          amountCentavos: 30_000,
          status: "confirmed",
          nonce: "n-test",
          createdAt: DET_TIME,
          confirmedAt: DET_TIME,
        },
      ],
    ]);

  function refundEnv(
    sessionId: string,
    owner: string,
  ): IntentEnvelope<PixIntentKind, unknown> {
    return buildEnvelope({
      kind: "pix.charge.refund",
      payload: { chargeId: "cha-1", refundCentavos: 20_000, reason: "x" },
      actor: { principal: "user", sessionId },
      taint: "UNTRUSTED",
      nonce: "n-auth",
      createdAt: DET_TIME,
      resourceRefs: { owner, resource: RESOURCE },
    });
  }

  it("inert without injected authority — money-moving refund still EXECUTEs (pre-035 posture)", () => {
    // No `authority` in state ⇒ the guard returns null and the refund flows to
    // business exactly as the EXECUTE test above. Proves the seam is opt-in.
    const noAuthState: PixState = { charges: baseCharges() };
    const decision = adjudicate(refundEnv("s-owner", VICTIM), noAuthState, pixPolicyBundle);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("BINDING with injected authority — an honestly-authenticated owner EXECUTEs", () => {
    // owner=VICTIM, session resolves to VICTIM ⇒ the authenticated actor IS the
    // owner ⇒ the guard continues (null) and business EXECUTEs the refund.
    const authState: PixState = { charges: baseCharges(), authority };
    const decision = adjudicate(refundEnv("s-owner", VICTIM), authState, pixPolicyBundle);
    expect(decision.kind).toBe("EXECUTE");
  });

  it("REFUSEs the forged-unbound owner (declared owner not bound to the resource)", () => {
    const authState: PixState = { charges: baseCharges(), authority };
    const decision = adjudicate(refundEnv("s-attacker", "attacker"), authState, pixPolicyBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).toBe("tenant_binding_violation");
    expect(decision.basis.map((b) => `${b.category}:${b.code}`)).toContain(
      "auth:scope_insufficient",
    );
  });

  it("CLOSES IDOR — REFUSEs an impersonation (forged BOUND owner ≠ authenticated actor)", () => {
    // The attacker forges owner=VICTIM (the REAL bound owner) but the
    // authenticated session resolves to attacker_principal ⇒ REFUSE. This is the
    // case the bare wiring would let escape; the principalOf seam closes it.
    const authState: PixState = { charges: baseCharges(), authority };
    const decision = adjudicate(refundEnv("s-attacker", VICTIM), authState, pixPolicyBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("FAILS CLOSED when authority is injected without a principalOf identity source", () => {
    // A host that injects the store but NO identity map cannot prove the
    // authenticated actor, so even a genuinely-bound owner REFUSEs (no
    // false-sense-of-security fallback to bare declared-owner binding).
    const authState: PixState = { charges: baseCharges(), authority: { store } };
    const decision = adjudicate(refundEnv("s-owner", VICTIM), authState, pixPolicyBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    expect(decision.refusal.code).toBe("tenant_binding_violation");
  });

  it("the guard runs AFTER taint (§D #3): a TRUSTED-only confirm at UNTRUSTED hits the taint gate, not the owner predicate", () => {
    // pix.charge.confirm is TRUSTED-min; an UNTRUSTED proposal must be refused by
    // the TAINT gate (taint short-circuits before auth), never reach the owner
    // predicate. Use a PENDING charge so the state guard passes and the taint
    // gate is the one that fires. The forged owner ref would otherwise tempt the
    // authority guard — but the guard never matches confirm AND taint runs first.
    const pendingCharges: ReadonlyMap<string, PixCharge> = new Map<string, PixCharge>([
      ["cha-1", { id: "cha-1", amountCentavos: 30_000, status: "pending", nonce: "n-test", createdAt: DET_TIME }],
    ]);
    const authState: PixState = { charges: pendingCharges, authority };
    const confirmEnv = buildEnvelope({
      kind: "pix.charge.confirm",
      payload: { chargeId: "cha-1", providerTxId: "ptx", confirmedAt: DET_TIME },
      actor: { principal: "llm", sessionId: "s-attacker" },
      taint: "UNTRUSTED",
      nonce: "n-confirm",
      createdAt: DET_TIME,
      resourceRefs: { owner: VICTIM, resource: RESOURCE },
    });
    const decision = adjudicate(confirmEnv, authState, pixPolicyBundle);
    expect(decision.kind).toBe("REFUSE");
    if (decision.kind !== "REFUSE") return;
    // The refusal is the TAINT gate's (SECURITY), reached BEFORE the auth phase —
    // so it is NOT the authority guard's tenant_binding_violation. This pins the
    // state→taint→auth ordering: taint short-circuits before the owner predicate.
    expect(decision.refusal.kind).toBe("SECURITY");
    expect(decision.refusal.code).not.toBe("tenant_binding_violation");
  });
});
