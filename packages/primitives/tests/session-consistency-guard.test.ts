import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import {
  createSessionConsistencyGuard,
  type SessionContradiction,
} from "../src/index.js";

interface S {
  readonly priorAmount?: number;
  readonly shipped?: boolean;
}

const env = (payload: Record<string, unknown> = {}) =>
  buildEnvelope({
    kind: "order.update",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

// Adopter predicate: a shipped order is a HARD contradiction; an amount that
// differs from the recorded prior amount is SUSPICIOUS. All "logic" lives here,
// in the adopter's pure predicate — the factory adds none.
const guard = (
  extra: Partial<
    Parameters<
      typeof createSessionConsistencyGuard<string, Record<string, unknown>, S>
    >[0]
  > = {},
) =>
  createSessionConsistencyGuard<string, Record<string, unknown>, S>({
    contradicts: (e, s) => {
      if (s.shipped === true) {
        return {
          severity: "hard",
          reason: "order already shipped",
          detail: { shipped: true },
        };
      }
      if (s.priorAmount !== undefined && e.payload.amount !== s.priorAmount) {
        return { severity: "suspicious", reason: "amount differs from recorded value" };
      }
      return null;
    },
    ...extra,
  });

describe("createSessionConsistencyGuard", () => {
  it("returns null when the predicate finds no contradiction", () => {
    expect(guard()(env({ amount: 10 }), { priorAmount: 10 })).toBeNull();
  });

  it("REFUSEs (STATE / session.contradiction) on a hard verdict", () => {
    const d = guard()(env(), { shipped: true });
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.refusal.kind).toBe("STATE");
    expect(d.refusal.code).toBe("session.contradiction");
    expect(d.refusal.detail).toBe("order already shipped");
    expect(d.refusal.userFacing).toBe(
      "That request conflicts with what we have on record for this session.",
    );
    expect(d.basis[0]).toMatchObject({ category: "state", code: "transition_illegal" });
    expect(d.basis[0]!.detail).toMatchObject({
      rule: "session_contradiction",
      severity: "hard",
      reason: "order already shipped",
      shipped: true,
    });
  });

  it("ESCALATEs to supervisor on a suspicious verdict", () => {
    const d = guard()(env({ amount: 99 }), { priorAmount: 10 });
    if (d?.kind !== "ESCALATE") throw new Error("expected ESCALATE");
    expect(d.to).toBe("supervisor");
    expect(d.reason).toBe("amount differs from recorded value");
    expect(d.basis[0]!.detail).toMatchObject({
      rule: "session_contradiction",
      severity: "suspicious",
    });
  });

  it("honors refusalKind / refusalCode / userFacing overrides", () => {
    const d = guard({
      refusalKind: "SECURITY",
      refusalCode: "custom.code",
      userFacing: (c: SessionContradiction) => `blocked: ${c.reason}`,
    })(env(), { shipped: true });
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.refusal.kind).toBe("SECURITY");
    expect(d.refusal.code).toBe("custom.code");
    expect(d.refusal.userFacing).toBe("blocked: order already shipped");
  });

  it("honors the escalateTo override", () => {
    const d = guard({ escalateTo: "human" })(env({ amount: 99 }), { priorAmount: 10 });
    if (d?.kind !== "ESCALATE") throw new Error("expected ESCALATE");
    expect(d.to).toBe("human");
  });

  it("canonical basis-detail keys win over adopter-supplied detail", () => {
    const g = createSessionConsistencyGuard<string, Record<string, unknown>, S>({
      contradicts: () => ({
        severity: "hard",
        reason: "real reason",
        detail: { rule: "spoofed", severity: "spoofed", reason: "spoofed", extra: 1 },
      }),
    });
    const d = g(env(), {});
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.basis[0]!.detail).toMatchObject({
      rule: "session_contradiction",
      severity: "hard",
      reason: "real reason",
      extra: 1,
    });
  });

  it("never emits REWRITE and is deterministic for a given (envelope,state)", () => {
    const g = guard();
    const e = env({ amount: 99 });
    const s: S = { priorAmount: 10 };
    const a = g(e, s);
    const b = g(e, s);
    expect(a).toEqual(b);
    // Structurally this guard only ever returns null | REFUSE | ESCALATE.
    expect(a && (a.kind === "REFUSE" || a.kind === "ESCALATE")).toBe(true);
  });

  it("metadata is opaque (no GuardDescription widening)", () => {
    expect(readGuardMetadata(guard())?.description?.kind).toBe("opaque");
  });
});
