import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildEnvelope } from "@adjudicate/core";
import type { PolicyBundle, Taint } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import { createDataClassificationGuard } from "../src/index.js";

const TAINT_RANK: Record<Taint, number> = { SYSTEM: 3, TRUSTED: 2, UNTRUSTED: 1 };
const at = "2026-04-29T12:00:00.000Z";

function bundle(action: "REWRITE" | "REFUSE"): PolicyBundle<string, unknown, unknown> {
  return {
    stateGuards: [],
    authGuards: [],
    taint: { minimumFor: () => "UNTRUSTED" },
    business: [
      createDataClassificationGuard<string, unknown, unknown>({
        matches: () => true,
        patterns: [{ id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ }],
        scannedFields: ["note"],
        action,
        sensitivityLevel: "high",
      }),
    ],
    default: "EXECUTE",
  };
}

const taintArb = fc.constantFrom<Taint>("UNTRUSTED", "TRUSTED", "SYSTEM");
// Sometimes embed a real SSN so REWRITE/REFUSE fires; otherwise pass-through.
const noteArb = fc.oneof(
  fc.string(),
  fc.string().map((s) => `${s} 123-45-6789 ${s}`),
);

describe("createDataClassificationGuard — replay determinism", () => {
  it("same (envelope, state, policy) → byte-identical Decision (incl. rewritten.intentHash)", () => {
    fc.assert(
      fc.property(taintArb, noteArb, fc.constantFrom<"REWRITE" | "REFUSE">("REWRITE", "REFUSE"), (taint, note, action) => {
        const policy = bundle(action);
        const envelope = buildEnvelope({
          kind: "test.submit",
          payload: { note },
          actor: { principal: "llm", sessionId: "sess" },
          taint,
          nonce: "fixed-nonce",
          createdAt: at,
        });
        const a = adjudicate(envelope, {}, policy);
        const b = adjudicate(envelope, {}, policy);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: 1000 },
    );
  });

  it("REWRITE never raises taint (no rewrite_taint_regression)", () => {
    fc.assert(
      fc.property(taintArb, (taint) => {
        const policy = bundle("REWRITE");
        const envelope = buildEnvelope({
          kind: "test.submit",
          payload: { note: "ssn 123-45-6789" },
          actor: { principal: "llm", sessionId: "sess" },
          taint,
          nonce: "fixed-nonce",
          createdAt: at,
        });
        const decision = adjudicate(envelope, {}, policy);
        if (decision.kind === "REWRITE") {
          expect(TAINT_RANK[decision.rewritten.taint]).toBeLessThanOrEqual(TAINT_RANK[taint]);
          expect(decision.rewritten.taint).toBe(taint);
        }
      }),
      { numRuns: 200 },
    );
  });
});
