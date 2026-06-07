import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildEnvelope, type PolicyBundle } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import { createTokenBudgetGuard } from "../src/index.js";

interface S {
  readonly tokensConsumed: number;
}

const policy: PolicyBundle<string, unknown, S> = {
  stateGuards: [],
  authGuards: [],
  taint: { minimumFor: () => "UNTRUSTED" },
  business: [
    createTokenBudgetGuard<string, unknown, S>({
      extractSessionTokens: (s) => s.tokensConsumed,
      sessionBudget: 1000,
    }),
  ],
  default: "EXECUTE",
};

const env = () =>
  buildEnvelope({
    kind: "agent.step",
    payload: {},
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

describe("createTokenBudgetGuard — determinism", () => {
  it("same (envelope, state) → identical decision; reading does not mutate state", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (consumed) => {
        const state = Object.freeze({ tokensConsumed: consumed });
        const a = adjudicate(env(), state, policy);
        const b = adjudicate(env(), state, policy);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        // Deep-frozen state proves the guard never mutates S.
        expect(state.tokensConsumed).toBe(consumed);
        expect(a.kind).toBe(consumed >= 1000 ? "REFUSE" : "EXECUTE");
      }),
      { numRuns: 500 },
    );
  });
});
