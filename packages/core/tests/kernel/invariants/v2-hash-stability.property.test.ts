/**
 * Invariant: v2 envelope hash stability under createdAt perturbation.
 *
 * Pre-T8 the IntentEnvelope hashed `(version, kind, payload, createdAt,
 * actor, taint)`. Adopters who rebuilt envelopes on retry without
 * preserving `createdAt` produced a different intentHash and silently
 * broke ledger dedup. v2 separates the idempotency key (`nonce`) from
 * descriptive metadata (`createdAt`). The load-bearing property: same
 * `nonce`, different `createdAt` → same `intentHash`.
 *
 * **041 — recipe note.** The current recipe is `(version, kind, payload,
 * nonce, actor, taint, origin)`; plan 041 added `origin` to the pre-image
 * (always-present, defaulting to `DEFAULT_ORIGIN`). This invariant is about
 * `createdAt` EXCLUSION, which is orthogonal to `origin` and unchanged by
 * 041: these envelopes are built without an explicit `origin` so both sides
 * of every pair share the same default origin, and the property — same
 * nonce + different createdAt → same hash — holds exactly as before. The
 * assertions here pin RELATIONS (createdAt-invariance, nonce-sensitivity,
 * determinism), not any literal hash, so the 041 pre-image change keeps this
 * suite green without re-pinning. (The "origin is INSIDE the pre-image"
 * property is asserted separately in hash-determinism.test.ts.)
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  type Taint,
} from "@adjudicate/core";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");
const principalArb = fc.constantFrom<"llm" | "user" | "system">(
  "llm",
  "user",
  "system",
);

describe("invariant: v2 intentHash is invariant under createdAt perturbation", () => {
  // TestReviewer-008: fuzz with deeply-nested JSON-safe payloads, not the
  // trivial { x: 1 }. numRuns is capped (recursive payloads are heavier) so the
  // suite stays fast and deterministic — coverage comes from payload SHAPE.
  it("same nonce + different createdAt → same intentHash (recursive payloads)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }), // nonce
        jsonSafePayloadArb, // recursive, nested, JSON-safe payload
        taintArb,
        principalArb,
        fc.string({ minLength: 1, maxLength: 6 }), // session id
        (nonce, payload, taint, principal, sessionId) => {
          const envA = buildEnvelope({
            kind: "order.tool.propose",
            payload,
            actor: { principal, sessionId },
            taint,
            nonce,
            createdAt: "2026-04-01T10:00:00.000Z",
          });
          const envB = buildEnvelope({
            kind: "order.tool.propose",
            payload,
            actor: { principal, sessionId },
            taint,
            nonce,
            createdAt: "2026-12-31T23:59:59.999Z", // very different timestamp
          });
          expect(envA.intentHash).toBe(envB.intentHash);
          expect(envA.createdAt).not.toBe(envB.createdAt); // metadata differs
        },
      ),
      { numRuns: 1_000 },
    );
  });

  // TestReviewer-008: the hash is a deterministic function of the canonical
  // payload — building twice from the SAME nested payload yields the SAME hash.
  it("intentHash is deterministic for any nested JSON-safe payload", () => {
    fc.assert(
      fc.property(jsonSafePayloadArb, taintArb, (payload, taint) => {
        const common = {
          kind: "order.tool.propose" as const,
          payload,
          actor: { principal: "llm" as const, sessionId: "s" },
          taint,
          nonce: "fixed-nonce",
          createdAt: "2026-04-01T10:00:00.000Z",
        };
        expect(buildEnvelope(common).intentHash).toBe(
          buildEnvelope(common).intentHash,
        );
      }),
      { numRuns: 1_000 },
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
