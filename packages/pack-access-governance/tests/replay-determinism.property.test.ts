import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { adjudicate, buildEnvelope, type Decision } from "@adjudicate/core";
import { accessGovernancePack, rehydrateAccessState } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";
const flat = (d: Decision) => `${d.kind}|${d.basis.map((b) => `${b.category}:${b.code}`).sort().join(",")}`;

describe("pack-access-governance — replay determinism", () => {
  it("same (envelope, state) → identical decision; REWRITE preserves taint", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("db.analytics", "db.prod", "payroll", "nope"),
        fc.integer({ min: 0, max: 3 }),
        (resourceId, privilegeLevel) => {
          const env = buildEnvelope({
            kind: "access.request",
            payload: { principal: "a", resourceId, privilegeLevel, justification: "x" },
            actor: { principal: "llm", sessionId: "s" },
            taint: "UNTRUSTED",
            nonce: "fixed",
            createdAt: at,
          });
          const state = rehydrateAccessState({ reviews: {}, grants: {} });
          const a = adjudicate(env, state, accessGovernancePack.policy);
          const b = adjudicate(env, state, accessGovernancePack.policy);
          expect(flat(a)).toBe(flat(b));
          if (a.kind === "REWRITE") expect(a.rewritten.taint).toBe("UNTRUSTED");
        },
      ),
      { numRuns: 400 },
    );
  });
});
