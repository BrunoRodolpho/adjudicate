import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { adjudicate, buildEnvelope, type Decision, type Taint } from "@adjudicate/core";
import { incidentResponsePack, rehydrateIncidentState } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";

function flat(d: Decision): string {
  return `${d.kind}|${d.basis.map((b) => `${b.category}:${b.code}`).sort().join(",")}`;
}

describe("pack-incident-response — replay determinism", () => {
  it("same (envelope, state) → identical decision; REWRITE never raises taint", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Taint>("UNTRUSTED", "TRUSTED"),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        (taint, blastRadius, depDown) => {
          const incidents = {
            "inc-1": {
              id: "inc-1",
              severity: "sev2" as const,
              status: "open" as const,
              dependencies: depDown ? [{ service: "db", status: "down" as const }] : [],
              createdAt: at,
            },
          };
          const env = buildEnvelope({
            kind: "incident.remediation.execute",
            payload: { incidentId: "inc-1", action: "x", blastRadius },
            actor: { principal: taint === "TRUSTED" ? "user" : "llm", sessionId: "s" },
            taint,
            nonce: "fixed",
            createdAt: at,
          });
          const state = rehydrateIncidentState({ incidents });
          const a = adjudicate(env, state, incidentResponsePack.policy);
          const b = adjudicate(env, state, incidentResponsePack.policy);
          expect(flat(a)).toBe(flat(b));
          if (a.kind === "REWRITE") expect(a.rewritten.taint).toBe(taint);
        },
      ),
      { numRuns: 500 },
    );
  });
});
