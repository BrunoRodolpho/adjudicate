/**
 * Invariant: v2 envelope hash stability under createdAt perturbation.
 *
 * Pre-T8 the IntentEnvelope hashed `(version, kind, payload, createdAt,
 * actor, taint)`. Adopters who rebuilt envelopes on retry without
 * preserving `createdAt` produced a different intentHash and silently
 * broke ledger dedup. v2 separates the idempotency key (`nonce`) from
 * descriptive metadata (`createdAt`). The load-bearing property: same
 * `nonce`, different `createdAt` → same `intentHash`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  type Taint,
} from "@adjudicate/core";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const principalArb = fc.constantFrom<"llm" | "user" | "system">(
  "llm",
  "user",
  "system",
);

describe("invariant: v2 intentHash is invariant under createdAt perturbation", () => {
  it("same nonce + different createdAt → same intentHash", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }), // nonce
        fc.string({ minLength: 1, maxLength: 12 }), // payload seed
        taintArb,
        principalArb,
        fc.string({ minLength: 1, maxLength: 6 }), // session id
        (nonce, seed, taint, principal, sessionId) => {
          const envA = buildEnvelope({
            kind: "order.tool.propose",
            payload: { x: seed },
            actor: { principal, sessionId },
            taint,
            nonce,
            createdAt: "2026-04-01T10:00:00.000Z",
          });
          const envB = buildEnvelope({
            kind: "order.tool.propose",
            payload: { x: seed },
            actor: { principal, sessionId },
            taint,
            nonce,
            createdAt: "2026-12-31T23:59:59.999Z", // very different timestamp
          });
          expect(envA.intentHash).toBe(envB.intentHash);
          expect(envA.createdAt).not.toBe(envB.createdAt); // metadata differs
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it("different nonce → different intentHash (else dedup is broken)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        (nonceA, nonceB) => {
          if (nonceA === nonceB) return; // skip when nonces collide
          const envA = buildEnvelope({
            kind: "order.tool.propose",
            payload: { x: 1 },
            actor: { principal: "llm", sessionId: "s" },
            taint: "TRUSTED",
            nonce: nonceA,
            createdAt: "2026-04-01T10:00:00.000Z",
          });
          const envB = buildEnvelope({
            kind: "order.tool.propose",
            payload: { x: 1 },
            actor: { principal: "llm", sessionId: "s" },
            taint: "TRUSTED",
            nonce: nonceB,
            createdAt: "2026-04-01T10:00:00.000Z",
          });
          expect(envA.intentHash).not.toBe(envB.intentHash);
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
