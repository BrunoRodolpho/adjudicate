/**
 * M2/T-024..T-027 — tests for the new L2 factories.
 */
import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  type IntentEnvelope,
} from "@adjudicate/core";
import {
  createConfirmGuard,
  createEscalateGuard,
  createIdempotencyGuard,
  createRewriteGuard,
} from "../src/index.js";

type K = "test.action";
type S = { cap: number; processedIds: Set<string> };

const baseEnvelope = (payload: Record<string, unknown>): IntentEnvelope<K, unknown> =>
  buildEnvelope({
    kind: "test.action" as K,
    payload,
    actor: { principal: "llm", sessionId: "s-1" },
    taint: "UNTRUSTED",
    nonce: "fixed-nonce",
  });

const baseState: S = { cap: 100, processedIds: new Set(["seen-1"]) };

describe("createRewriteGuard", () => {
  const guard = createRewriteGuard<K, unknown, S>({
    matches: (env) => env.kind === "test.action",
    extract: (env) => (env.payload as { amount: number }).amount,
    cap: (state) => state.cap,
    mutateField: "amount",
    reason: "Clamped to cap.",
  });

  it("REWRITEs when value exceeds cap", () => {
    const decision = guard(baseEnvelope({ amount: 200 }), baseState);
    expect(decision).not.toBeNull();
    expect(decision!.kind).toBe("REWRITE");
    if (decision!.kind === "REWRITE") {
      expect((decision!.rewritten.payload as { amount: number }).amount).toBe(100);
    }
  });

  it("passes through when value at or under cap", () => {
    expect(guard(baseEnvelope({ amount: 100 }), baseState)).toBeNull();
    expect(guard(baseEnvelope({ amount: 50 }), baseState)).toBeNull();
  });

  it("does not engage when matches returns false", () => {
    const wrongKind: IntentEnvelope<string, unknown> = buildEnvelope({
      kind: "other.kind",
      payload: { amount: 999 },
      actor: { principal: "llm", sessionId: "s-1" },
      taint: "UNTRUSTED",
      nonce: "fixed-nonce",
    });
    expect(guard(wrongKind as IntentEnvelope<K, unknown>, baseState)).toBeNull();
  });

  it("rewritten envelope's intentHash differs from original (re-derived)", () => {
    const original = baseEnvelope({ amount: 200 });
    const decision = guard(original, baseState);
    if (decision?.kind === "REWRITE") {
      expect(decision.rewritten.intentHash).not.toBe(original.intentHash);
    }
  });
});

describe("createConfirmGuard", () => {
  const guard = createConfirmGuard<K, unknown, S>({
    matches: (env) => env.kind === "test.action",
    extract: (env) => (env.payload as { amount: number }).amount,
    threshold: 500,
    prompt: (value) => `Confirm action for ${value}?`,
  });

  it("REQUEST_CONFIRMATION at or above threshold", () => {
    const d = guard(baseEnvelope({ amount: 500 }), baseState);
    expect(d?.kind).toBe("REQUEST_CONFIRMATION");
    if (d?.kind === "REQUEST_CONFIRMATION") {
      expect(d.prompt).toBe("Confirm action for 500?");
    }
  });

  it("passes through below threshold", () => {
    expect(guard(baseEnvelope({ amount: 499 }), baseState)).toBeNull();
  });
});

describe("createEscalateGuard", () => {
  const guard = createEscalateGuard<K, unknown, S>({
    matches: (env) => env.kind === "test.action",
    extract: (env) => (env.payload as { amount: number }).amount,
    threshold: 1000,
    to: "supervisor",
    reason: (value) => `Amount ${value} exceeds supervisor threshold.`,
  });

  it("ESCALATEs to supervisor at or above threshold", () => {
    const d = guard(baseEnvelope({ amount: 1500 }), baseState);
    expect(d?.kind).toBe("ESCALATE");
    if (d?.kind === "ESCALATE") {
      expect(d.to).toBe("supervisor");
      expect(d.reason).toContain("1500");
    }
  });

  it("passes through below threshold", () => {
    expect(guard(baseEnvelope({ amount: 999 }), baseState)).toBeNull();
  });
});

describe("createIdempotencyGuard", () => {
  const guard = createIdempotencyGuard<K, unknown, S>({
    matches: (env) => env.kind === "test.action",
    extractKey: (env) => (env.payload as { orderId: string }).orderId,
    hasBeenSeen: (key, _env, state) => state.processedIds.has(key),
    onReplay: (key) => ({
      kind: "REFUSE",
      refusal: {
        kind: "STATE",
        code: "idempotency_replay",
        userFacing: "Already processed.",
        detail: `key=${key}`,
      },
      basis: [],
    }),
  });

  it("REFUSEs when key has been seen", () => {
    const d = guard(baseEnvelope({ orderId: "seen-1" }), baseState);
    expect(d?.kind).toBe("REFUSE");
    if (d?.kind === "REFUSE") {
      expect(d.refusal.code).toBe("idempotency_replay");
    }
  });

  it("passes through when key not seen", () => {
    expect(guard(baseEnvelope({ orderId: "not-seen" }), baseState)).toBeNull();
  });

  it("passes through when key absent / empty", () => {
    expect(guard(baseEnvelope({}), baseState)).toBeNull();
    expect(guard(baseEnvelope({ orderId: "" }), baseState)).toBeNull();
  });
});
