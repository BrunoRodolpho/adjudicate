/**
 * Invariant: UNTRUSTED never yields EXECUTE (when policy demands TRUSTED or higher).
 *
 * This is the load-bearing property of the Zero-Trust bridge. If it fails once,
 * the kernel has a path by which user-origin content escalates authority.
 *
 * Phrased as an invariant over the *outcome*, not over the implementation —
 * regardless of which guard, which state, or which business rule, an UNTRUSTED
 * envelope MUST NOT produce EXECUTE for an intent kind whose policy demands
 * TRUSTED/SYSTEM.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildEnvelope,
  type IntentEnvelope,
  type Taint,
  type TaintPolicy,
} from "@adjudicate/core";
import { adjudicate } from "../../../src/kernel/adjudicate.js";
import type { PolicyBundle } from "../../../src/kernel/policy.js";
import { jsonSafePayloadArb } from "../../helpers/json-safe-arb.js";

const taintArb = fc.constantFrom<Taint>("SYSTEM", "TRUSTED", "UNTRUSTED");

const HIGH_TRUST_KINDS = [
  "payment.send",
  "order.submit",
  "pix.send",
  "refund.issue",
] as const;

const intentKindArb = fc.constantFrom(...HIGH_TRUST_KINDS);

const hightrustPolicy: TaintPolicy = {
  minimumFor: () => "SYSTEM",
};

function emptyBundle(
  defaultKind: "REFUSE" | "EXECUTE" = "EXECUTE",
): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: hightrustPolicy,
    business: [],
    default: defaultKind,
  };
}

// TestReviewer-008: fuzz with deeply-nested JSON-safe payloads instead of the
// trivial { x: 1 }; coverage comes from payload SHAPE. numRuns capped at 1_000
// (recursive payloads are heavier than a flat scalar — same cap as
// v2-hash-stability).
function env(
  kind: string,
  taint: Taint,
  payload: Record<string, unknown>,
): IntentEnvelope<string, unknown> {
  return buildEnvelope<string, unknown>({
    kind,
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint,
    nonce: "n-test", createdAt: "2026-04-23T12:00:00.000Z",
  });
}

describe("invariant: UNTRUSTED never yields EXECUTE when policy demands SYSTEM", () => {
  it("holds for any UNTRUSTED envelope and any high-trust intent kind", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "UNTRUSTED", payload), {}, emptyBundle());
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds when the default is EXECUTE (fail-open default must still refuse taint)", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(
          env(kind, "UNTRUSTED", payload),
          {},
          emptyBundle("EXECUTE"),
        );
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });

  it("holds when the default is REFUSE", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(
          env(kind, "UNTRUSTED", payload),
          {},
          emptyBundle("REFUSE"),
        );
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: TRUSTED never yields EXECUTE when policy demands SYSTEM", () => {
  it("blocks TRUSTED from SYSTEM-minimum kinds", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "TRUSTED", payload), {}, emptyBundle());
        expect(decision.kind).not.toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: SYSTEM passes the taint gate for any intent kind", () => {
  it("allows SYSTEM-taint envelopes through the taint layer", () => {
    fc.assert(
      fc.property(intentKindArb, jsonSafePayloadArb, (kind, payload) => {
        const decision = adjudicate(env(kind, "SYSTEM", payload), {}, emptyBundle());
        expect(decision.kind).toBe("EXECUTE");
      }),
      { numRuns: 1_000 },
    );
  });
});

describe("invariant: taint-only test, no other guards fire", () => {
  it("the refusal carries taint basis when it short-circuits on taint", () => {
    fc.assert(
      fc.property(taintArb, intentKindArb, jsonSafePayloadArb, (taint, kind, payload) => {
        const decision = adjudicate(env(kind, taint, payload), {}, emptyBundle());
        if (taint !== "SYSTEM") {
          expect(decision.kind).toBe("REFUSE");
          if (decision.kind !== "REFUSE") return;
          expect(
            decision.basis.some(
              (b) => b.category === "taint" && b.code === "level_insufficient",
            ),
          ).toBe(true);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
