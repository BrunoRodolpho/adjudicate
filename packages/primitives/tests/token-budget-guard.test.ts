import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import { readGuardMetadata } from "@adjudicate/core/kernel";
import { createTokenBudgetGuard } from "../src/index.js";

interface S {
  readonly tokensConsumed: number;
  readonly tenantTokens?: number;
}

const env = () =>
  buildEnvelope({
    kind: "agent.step",
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

const sessionGuard = (extra: Partial<Parameters<typeof createTokenBudgetGuard<string, unknown, S>>[0]> = {}) =>
  createTokenBudgetGuard<string, unknown, S>({
    extractSessionTokens: (s) => s.tokensConsumed,
    sessionBudget: 1000,
    ...extra,
  });

describe("createTokenBudgetGuard — session", () => {
  it("returns null under budget", () => {
    expect(sessionGuard()(env(), { tokensConsumed: 999 })).toBeNull();
  });
  it("REFUSEs at/over budget with detail", () => {
    const d = sessionGuard()(env(), { tokensConsumed: 1000 });
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.refusal.kind).toBe("BUSINESS_RULE");
    expect(d.basis[0]!.detail).toMatchObject({ rule: "token_budget", scope: "session", consumed: 1000, budget: 1000 });
  });
  it("respects matches predicate", () => {
    const g = sessionGuard({ matches: () => false });
    expect(g(env(), { tokensConsumed: 5000 })).toBeNull();
  });
  it("DEFER action parks on token_budget_reset", () => {
    const g = sessionGuard({ action: "DEFER", deferTimeoutMs: 60_000 });
    const d = g(env(), { tokensConsumed: 2000 });
    if (d?.kind !== "DEFER") throw new Error("expected DEFER");
    expect(d.signal).toBe("token_budget_reset");
    expect(d.timeoutMs).toBe(60_000);
  });
  it("metadata is opaque (no GuardDescription widening)", () => {
    expect(readGuardMetadata(sessionGuard())?.description?.kind).toBe("opaque");
  });
});

describe("createTokenBudgetGuard — tenant + misconfig", () => {
  it("crosses on tenant budget when session is under", () => {
    const g = createTokenBudgetGuard<string, unknown, S>({
      extractSessionTokens: (s) => s.tokensConsumed,
      extractTenantTokens: (s) => s.tenantTokens ?? 0,
      sessionBudget: 1000,
      tenantBudget: 5000,
    });
    const d = g(env(), { tokensConsumed: 10, tenantTokens: 5000 });
    if (d?.kind !== "REFUSE") throw new Error("expected REFUSE");
    expect(d.basis[0]!.detail).toMatchObject({ scope: "tenant", consumed: 5000, budget: 5000 });
  });
  it("throws when no budget configured", () => {
    expect(() => createTokenBudgetGuard<string, unknown, S>({ extractSessionTokens: (s) => s.tokensConsumed }))
      .toThrow(/at least one of sessionBudget/);
  });
  it("throws when DEFER without deferTimeoutMs", () => {
    expect(() => sessionGuard({ action: "DEFER" })).toThrow(/deferTimeoutMs is required/);
  });
  it("throws when tenantBudget without extractTenantTokens", () => {
    expect(() =>
      createTokenBudgetGuard<string, unknown, S>({
        extractSessionTokens: (s) => s.tokensConsumed,
        tenantBudget: 100,
      }),
    ).toThrow(/extractTenantTokens is required/);
  });
});
