import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import { createTokenBudgetGuard } from "../src/index.js";

interface S {
  readonly tokensConsumed: number;
}

const env = (payload: unknown = {}) =>
  buildEnvelope({
    kind: "agent.step",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

const guard = createTokenBudgetGuard<string, unknown, S>({
  extractSessionTokens: (s) => s.tokensConsumed,
  sessionBudget: 1000,
});

describe("createTokenBudgetGuard — adversarial / negative", () => {
  it("NaN consumed does not spuriously cross (returns null)", () => {
    expect(guard(env(), { tokensConsumed: Number.NaN })).toBeNull();
  });
  it("negative consumed never crosses", () => {
    expect(guard(env(), { tokensConsumed: -50 })).toBeNull();
  });
  it("Infinity consumed is treated as over budget → REFUSE (fail-closed)", () => {
    // +Infinity ≥ any finite budget, so it crosses: a broken/overflowed meter
    // must NOT let an over-budget session through (fail-closed for cost control).
    const d = guard(env(), { tokensConsumed: Number.POSITIVE_INFINITY });
    expect(d?.kind).toBe("REFUSE");
  });
  it("a payload-injected fake tokensConsumed is ignored (guard reads only S)", () => {
    // Payload claims 0 tokens, but real state S is over budget → still REFUSE.
    const d = guard(env({ tokensConsumed: 0 }), { tokensConsumed: 5000 });
    expect(d?.kind).toBe("REFUSE");
  });
});
