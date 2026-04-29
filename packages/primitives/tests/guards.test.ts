import { describe, expect, it } from "vitest";
import {
  basis,
  buildEnvelope,
  decisionEscalate,
  decisionExecute,
  decisionRefuse,
  refuse,
} from "@adjudicate/core";
import {
  createStateDeferGuard,
  createThresholdGuard,
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
